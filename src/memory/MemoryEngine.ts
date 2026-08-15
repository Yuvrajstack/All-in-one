import { MemoryRepository } from './MemoryRepository'
import { VectorRepository } from './VectorRepository'
import { EmbeddingService } from '../rag/EmbeddingService'
import { ClassificationService } from './ClassificationService'
import { CreateMemoryInput, MemoryUnit, SearchResult } from '../types'

export class MemoryEngine {
  private memRepo    = new MemoryRepository()
  private vecRepo    = new VectorRepository()
  private embedding  = new EmbeddingService()
  private classifier = new ClassificationService()

  // ─── STORE ───────────────────────────────────────────────
  async store(input: CreateMemoryInput): Promise<MemoryUnit> {
    // Step 1: save to Postgres first (source of truth)
    const memory = await this.memRepo.store(input)

    // Auto-populate specific tables (tasks, events, projects) for direct lookup
    try {
      const pool = require('../db/postgres').default
      if (memory.type === 'task') {
        await pool.query(
          `INSERT INTO tasks (memory_id, user_id, title, description, status, due_date, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [memory.id, memory.userId, memory.content, `Extracted from ${memory.source}`, 'pending', memory.dueDate || null, 3]
        )
      } else if (memory.type === 'event') {
        await pool.query(
          `INSERT INTO events (memory_id, user_id, title, description, location, meeting_link, event_date, duration_minutes, attendees, event_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [memory.id, memory.userId, memory.content, `Extracted from ${memory.source}`, null, null, memory.eventDate || memory.createdAt, 60, [], memory.category === 'interview' ? 'interview' : 'meeting']
        )
      } else if (memory.type === 'project') {
        await pool.query(
          `INSERT INTO projects (memory_id, user_id, name, description, field, status, github_repo, deadline)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [memory.id, memory.userId, memory.content, `Extracted from ${memory.source}`, null, 'active', memory.sourceRef || null, memory.dueDate || null]
        )
      }
    } catch (dbErr) {
      console.error('Failed to auto-populate task/event/project tables:', dbErr)
    }

    // Step 2: try to index in Qdrant
    try {
      const vector   = await this.embedding.embed(input.content)
      const qdrantId = await this.vecRepo.upsert(
        memory.id,
        vector,
        {
          user_id:    memory.userId,
          memory_id:  memory.id,
          type:       memory.type,
          source:     memory.source,
          importance: memory.importance,
          created_at: memory.createdAt.getTime(),
        }
      )

      // Step 3: save qdrant_id back to Postgres
      await this.memRepo.update(memory.id, { qdrantId } as any)

    } catch (err) {
      console.error(`Qdrant indexing failed for memory ${memory.id}:`, err)
    }

    // Step 4: classify memory — extract people and projects
    try {
      await this.classifier.classify(memory.id, input.content)
    } catch (err) {
      console.error(`Classification failed for memory ${memory.id}:`, err)
    }

    return memory
  }

  // ─── RETRIEVE BY ID ──────────────────────────────────────
  async retrieve(id: string): Promise<MemoryUnit | null> {
    return await this.memRepo.findById(id)
  }

  // ─── SEARCH BY MEANING ───────────────────────────────────
  async search(
    query:  string,
    userId: string,
    topK:   number = 10
  ): Promise<SearchResult[]> {
    // Step 1: convert query to vector
    const queryVector = await this.embedding.embed(query)

    // Step 2: search Qdrant for similar memories
    const results = await this.vecRepo.search(queryVector, userId, topK)

    // Step 3: fetch full memory details from Postgres
    const memories = await Promise.all(
      results.map(async (r) => {
        const memory = await this.memRepo.findById(r.payload.memory_id)
        return {
          memory: memory!,
          score:  r.score,
        }
      })
    )

    return memories.filter(m => m.memory !== null)
  }

  // ─── HYBRID SEARCH ───────────────────────────────────────
  async hybridSearch(params: {
    query:     string
    userId:    string
    keyword?:  string
    type?:     string
    category?: string
    fromDate?: Date
    toDate?:   Date
    topK?:     number
  }): Promise<SearchResult[]> {

    // Run both searches in parallel
    const [semanticResults, keywordResults] = await Promise.all([
      this.search(params.query, params.userId, params.topK || 10),
      this.memRepo.hybridSearch({
        userId:   params.userId,
        keyword:  params.keyword,
        type:     params.type,
        category: params.category,
        fromDate: params.fromDate,
        toDate:   params.toDate,
        limit:    params.topK || 10
      })
    ])

    // Convert postgres results to SearchResult format
    const pgResults: SearchResult[] = keywordResults.map(m => ({
      memory: m,
      score:  m.importance
    }))

    // Combine and deduplicate by memory id
    const seen     = new Set<string>()
    const combined: SearchResult[] = []

    const maxLen = Math.max(semanticResults.length, pgResults.length)

    for (let i = 0; i < maxLen; i++) {
      if (i < semanticResults.length) {
        if (!seen.has(semanticResults[i].memory.id)) {
          seen.add(semanticResults[i].memory.id)
          combined.push(semanticResults[i])
        }
      }
      if (i < pgResults.length) {
        if (!seen.has(pgResults[i].memory.id)) {
          seen.add(pgResults[i].memory.id)
          combined.push(pgResults[i])
        }
      }
    }

    return combined.sort((a, b) => b.score - a.score)
  }

  // ─── UPDATE ──────────────────────────────────────────────
  async update(
    id:      string,
    updates: Partial<MemoryUnit>
  ): Promise<MemoryUnit> {
    return await this.memRepo.update(id, updates)
  }

  // ─── DELETE ──────────────────────────────────────────────
  async delete(id: string): Promise<void> {
    const memory = await this.memRepo.findById(id)
    if (!memory) return

    await this.memRepo.delete(id)

    if ((memory as any).qdrantId) {
      await this.vecRepo.delete((memory as any).qdrantId)
    }
  }
}