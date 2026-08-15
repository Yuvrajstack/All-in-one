import { MemoryEngine } from '../memory/MemoryEngine'
import { PriorityEngine } from '../priority/PriorityEngine'
import { CreateMemoryInput } from '../types'
import { groqClient, LLM_MODEL } from '../config/llm'

interface RawText {
  text:   string
  date?:  string
}

export class FactsAgent {
  private memEngine = new MemoryEngine()
  private priority  = new PriorityEngine()

  // ─── MAIN PROCESS ────────────────────────────────────────
  async process(input: RawText, userId: string): Promise<void> {
    console.log('📌 FactsAgent processing text...')
    const extracted = await this.extract(input)
    console.log(`📌 Extracted ${extracted.length} facts`)

    for (const item of extracted) {
      const importance = this.priority.calculate({
        daysSinceCreated: 0,
        accessCount:      0,
        maxAccessCount:   1,
        emotionalWeight:  item.emotionalWeight || 0.5,
        source:           'manual'
      })

      const memInput: CreateMemoryInput = {
        userId,
        type:      item.type,
        content:   item.content,
        category:  item.category || 'general',
        source:    'manual',
        importance,
        eventDate: item.eventDate ? new Date(item.eventDate) : undefined,
      }

      await this.memEngine.store(memInput)
    }
  }

  // ─── EXTRACT FACTS FROM TEXT ─────────────────────────────
  private async extract(input: RawText): Promise<any[]> {
    const prompt = `
You are an AI that extracts memories from plain text notes.
Analyze this text and extract all facts and events.

Text: "${input.text}"
Date: ${input.date || new Date().toISOString()}

Extract:
1. FACT memories → things that are true ("John works at Microsoft")
2. EVENT memories → things that happened ("Met John today")

Return ONLY valid JSON. No extra text:
{
  "memories": [
    {
      "type": "fact" | "event",
      "content": "clear description",
      "category": "general" | "interview" | "deadline",
      "emotionalWeight": 0.5,
      "eventDate": "ISO date or null"
    }
  ]
}`

    console.log('📌 Calling Groq API...')
    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })
    console.log('📌 Groq responded!')

    const raw     = response.choices[0].message.content || '{}'
    const cleaned = raw.replace(/```json|```/g, '').trim()

    try {
      const parsed = JSON.parse(cleaned)
      return Array.isArray(parsed) ? parsed : parsed.memories || []
    } catch {
      console.error('FactsAgent: failed to parse', raw)
      return []
    }
  }
}