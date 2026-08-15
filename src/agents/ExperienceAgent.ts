import { MemoryEngine } from '../memory/MemoryEngine'
import { groqClient, LLM_MODEL } from '../config/llm'
import pool from '../db/postgres'

export class ExperienceAgent {
  private memEngine = new MemoryEngine()

  // ─── MAIN: ANALYZE PATTERNS ──────────────────────────────
  async analyzePatterns(userId: string): Promise<string> {
    console.log('🧩 ExperienceAgent analyzing patterns...')

    // Step 1: fetch last 30 days of memories
    const memories = await this.fetchRecentMemories(userId, 30)

    if (memories.length === 0) {
      return 'Not enough memories to analyze patterns yet.'
    }

    console.log(`🧩 Analyzing ${memories.length} memories...`)

    // Step 2: build context
    const context = memories.map((m: any, i: number) => `
[${i + 1}] type: ${m.type} | source: ${m.source} | date: ${new Date(m.created_at).toDateString()}
content: ${m.content}
`).join('\n')

    // Step 3: find patterns using LLM
    const prompt = `
You are an AI that discovers behavioral patterns from a user's memories.
Analyze these memories and find meaningful patterns about the user's behavior,
habits, work style, and tendencies.

Memories (last 30 days):
${context}

Generate insights in this JSON format:
{
  "patterns": [
    {
      "title": "short pattern title",
      "description": "detailed explanation of the pattern",
      "confidence": 0.8,
      "category": "work" | "social" | "health" | "productivity"
    }
  ],
  "summary": "2-3 sentence overall behavioral summary"
}

Return ONLY valid JSON. No extra text.`

    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw     = response.choices[0].message.content || '{}'
    const cleaned = raw.replace(/```json|```/g, '').trim()

    try {
      const parsed = JSON.parse(cleaned)

      // Step 4: store patterns as experience memories
      await this.storePatterns(parsed.patterns, userId)

      return JSON.stringify(parsed, null, 2)
    } catch {
      console.error('ExperienceAgent: failed to parse', raw)
      return 'Could not analyze patterns at this time.'
    }
  }

  // ─── FETCH RECENT MEMORIES FROM POSTGRES ─────────────────
  private async fetchRecentMemories(
    userId: string,
    days:   number
  ): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM memories
       WHERE user_id    = $1
         AND deleted_at IS NULL
         AND created_at >= NOW() - INTERVAL '${days} days'
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    )
    return result.rows
  }

  // ─── STORE PATTERNS AS EXPERIENCE MEMORIES ───────────────
  private async storePatterns(
    patterns: any[],
    userId:   string
  ): Promise<void> {
    for (const pattern of patterns) {
      await this.memEngine.store({
        userId,
        type:      'fact',
        content:   `[PATTERN] ${pattern.title}: ${pattern.description}`,
        category:  'general',
        source:    'manual',
        importance: pattern.confidence || 0.5,
      })
      console.log(`🧩 Pattern stored: ${pattern.title}`)
    }
  }
}