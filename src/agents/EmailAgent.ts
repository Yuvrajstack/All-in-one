import { MemoryEngine } from '../memory/MemoryEngine'
import { PriorityEngine } from '../priority/PriorityEngine'
import { CreateMemoryInput } from '../types'
import { groqClient, LLM_MODEL } from '../config/llm'

interface RawEmail {
  from:    string
  subject: string
  body:    string
  date:    string
}

export class EmailAgent {
  private memEngine = new MemoryEngine()
  private priority  = new PriorityEngine()

  async process(email: RawEmail, userId: string): Promise<void> {
    console.log('📧 Extracting memories from email...')
    const extracted = await this.extract(email)
    console.log(`📧 Extracted ${extracted.length} memories`)

    for (const item of extracted) {
      const importance = this.priority.calculate({
        daysSinceCreated: 0,
        accessCount:      0,
        maxAccessCount:   1,
        emotionalWeight:  item.emotionalWeight || 0.5,
        source:           'gmail'
      })

      const input: CreateMemoryInput = {
        userId,
        type:      item.type,
        content:   item.content,
        category:  item.category,
        source:    'gmail',
        sourceRef: email.from,
        importance,
        eventDate: item.eventDate ? new Date(item.eventDate) : undefined,
        dueDate:   item.dueDate   ? new Date(item.dueDate)   : undefined,
      }

      await this.memEngine.store(input)
    }
  }

  private async extract(email: RawEmail): Promise<any[]> {
    const prompt = `
You are an AI that extracts memories from emails.
Analyze this email and return a JSON object with memories array.

Email:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Body: ${email.body}

Return ONLY a valid JSON object. No extra text. Format:
{
  "memories": [
    {
      "type": "fact",
      "content": "clear description",
      "category": "interview",
      "emotionalWeight": 0.5,
      "eventDate": null,
      "dueDate": null
    }
  ]
}`

    console.log('📧 Calling Groq API...')
    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })
    console.log('📧 Groq responded!')

    const raw = response.choices[0].message.content || '{}'

    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : parsed.memories || []
    } catch {
      console.error('EmailAgent: failed to parse LLM response', raw)
      return []
    }
  }
}