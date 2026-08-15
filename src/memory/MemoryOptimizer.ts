import pool from '../db/postgres'
import { MemoryEngine } from './MemoryEngine'
import { EmbeddingService } from '../rag/EmbeddingService'
import { groqClient, LLM_MODEL } from '../config/llm'

export class MemoryOptimizer {
  private memEngine = new MemoryEngine()
  private embedding = new EmbeddingService()

  // ─── MAIN: RUN ALL OPTIMIZATIONS ─────────────────────────
  async optimize(userId: string): Promise<void> {
    console.log('🔧 MemoryOptimizer starting...')

    await this.deduplicate(userId)
    await this.forget(userId)
    await this.summarizeOld(userId)

    console.log('🔧 MemoryOptimizer complete!')
  }

  // ─── DEDUPLICATION ───────────────────────────────────────
  async deduplicate(userId: string): Promise<void> {
    console.log('🔧 Running deduplication...')

    // fetch all memories
    const result = await pool.query(
      `SELECT id, content FROM memories
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [userId]
    )

    const memories = result.rows
    const deleted  = new Set<string>()
    let   count    = 0

    // compare each pair
    for (let i = 0; i < memories.length; i++) {
      if (deleted.has(memories[i].id)) continue

      const vec1 = await this.embedding.embed(memories[i].content)

      for (let j = i + 1; j < memories.length; j++) {
        if (deleted.has(memories[j].id)) continue

        const vec2       = await this.embedding.embed(memories[j].content)
        const similarity = this.cosineSimilarity(vec1, vec2)

        if (similarity > 0.95) {
          // delete the newer duplicate
          await this.memEngine.delete(memories[j].id)
          deleted.add(memories[j].id)
          count++
          console.log(`🔧 Duplicate removed: "${memories[j].content.slice(0, 50)}..."`)
        }
      }
    }

    console.log(`🔧 Deduplication complete: ${count} duplicates removed`)
  }

  // ─── FORGETTING MECHANISM ────────────────────────────────
  async forget(userId: string): Promise<void> {
    console.log('🔧 Running forgetting mechanism...')

    const result = await pool.query(
      `SELECT id, content, importance FROM memories
       WHERE user_id    = $1
         AND deleted_at IS NULL
         AND importance < 0.1
         AND (accessed_at IS NULL OR accessed_at < NOW() - INTERVAL '90 days')
         AND created_at < NOW() - INTERVAL '90 days'`,
      [userId]
    )

    let count = 0
    for (const memory of result.rows) {
      await this.memEngine.delete(memory.id)
      count++
      console.log(`🔧 Forgotten: "${memory.content.slice(0, 50)}..."`)
    }

    console.log(`🔧 Forgetting complete: ${count} memories forgotten`)
  }

  // ─── SUMMARIZE OLD MEMORIES ──────────────────────────────
  async summarizeOld(userId: string): Promise<void> {
    console.log('🔧 Running summarization...')

    // find memories older than 30 days
    const result = await pool.query(
      `SELECT id, content, type, source FROM memories
       WHERE user_id    = $1
         AND deleted_at IS NULL
         AND created_at < NOW() - INTERVAL '30 days'
         AND importance < 0.3
       LIMIT 20`,
      [userId]
    )

    if (result.rows.length === 0) {
      console.log('🔧 No old memories to summarize')
      return
    }

    // group and summarize
    const contents = result.rows.map(r => r.content).join('\n')

    const prompt = `
Summarize these old memories into 2-3 sentences.
Keep only the most important facts.

Memories:
${contents}

Return ONLY the summary text.`

    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })

    const summary = response.choices[0].message.content?.trim() || ''

    if (summary) {
      // store summary as new memory
      await this.memEngine.store({
        userId,
        type:       'fact',
        content:    `[SUMMARY] ${summary}`,
        category:   'general',
        source:     'manual',
        importance: 0.4,
      })

      // delete old memories
      for (const memory of result.rows) {
        await this.memEngine.delete(memory.id)
      }

      console.log(`🔧 Summarized ${result.rows.length} old memories into 1`)
    }
  }

  // ─── COSINE SIMILARITY ───────────────────────────────────
  private cosineSimilarity(a: number[], b: number[]): number {
    const dot    = a.reduce((sum, val, i) => sum + val * b[i], 0)
    const magA   = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
    const magB   = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
    return dot / (magA * magB)
  }
}