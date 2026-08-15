import { MemoryEngine } from '../memory/MemoryEngine'
import { PriorityEngine } from '../priority/PriorityEngine'
import { CreateMemoryInput } from '../types'
import { groqClient, LLM_MODEL } from '../config/llm'

interface GitHubEvent {
  type:   string
  repo:   string
  action: string
  title:  string
  date:   string
}

export class ProjectAgent {
  private memEngine = new MemoryEngine()
  private priority  = new PriorityEngine()

  // ─── MAIN PROCESS ────────────────────────────────────────
  async process(event: GitHubEvent, userId: string): Promise<void> {
    const extracted = await this.extract(event)

    for (const item of extracted) {
      const importance = this.priority.calculate({
        daysSinceCreated: 0,
        accessCount:      0,
        maxAccessCount:   1,
        emotionalWeight:  0.5,
        source:           'github'
      })

      const input: CreateMemoryInput = {
        userId,
        type:      item.type,
        content:   item.content,
        category:  item.category || 'general',
        source:    'github',
        sourceRef: event.repo,
        importance,
      }

      await this.memEngine.store(input)
    }
  }

  // ─── EXTRACT MEMORY FROM GITHUB EVENT ────────────────────
  private async extract(event: GitHubEvent): Promise<any[]> {
    const prompt = `
You are an AI that extracts project memories from GitHub events.
Analyze this GitHub event and return a JSON object with memories array.

GitHub Event:
Type:   ${event.type}
Repo:   ${event.repo}
Action: ${event.action}
Title:  ${event.title}
Date:   ${event.date}

Return ONLY a valid JSON object. No extra text. Format:
{
  "memories": [
    {
      "type": "fact" | "task" | "project",
      "content": "clear description of what happened",
      "category": "general"
    }
  ]
}`

    const response = await groqClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.choices[0].message.content || '{}'

    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : parsed.memories || []
    } catch {
      console.error('ProjectAgent: failed to parse LLM response', raw)
      return []
    }
  }
}