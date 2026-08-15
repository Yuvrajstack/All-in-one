import pool from '../db/postgres'
import { MemoryUnit, CreateMemoryInput } from '../types'
import { v4 as uuidv4 } from 'uuid'

export class MemoryRepository {

  // ─── STORE ───────────────────────────────────────────────
  async store(input: CreateMemoryInput): Promise<MemoryUnit> {
    const result = await pool.query(
      `INSERT INTO memories 
        (id, user_id, type, content, category, source, source_ref, importance, event_date, due_date)
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        uuidv4(),
        input.userId,
        input.type,
        input.content,
        input.category   || null,
        input.source,
        input.sourceRef  || null,
        input.importance || 0.5,
        input.eventDate  || null,
        input.dueDate    || null,
      ]
    )
    return this.toMemoryUnit(result.rows[0])
  }

  // ─── FIND BY ID ──────────────────────────────────────────
  async findById(id: string): Promise<MemoryUnit | null> {
    const result = await pool.query(
      `SELECT * FROM memories 
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (result.rows.length === 0) return null

    // update accessed_at every time we read
    await pool.query(
      `UPDATE memories SET accessed_at = NOW() WHERE id = $1`,
      [id]
    )
    return this.toMemoryUnit(result.rows[0])
  }

  // ─── UPDATE ──────────────────────────────────────────────
  async update(id: string, updates: Partial<MemoryUnit>): Promise<MemoryUnit> {
    const result = await pool.query(
      `UPDATE memories
       SET
         content    = COALESCE($2, content),
         importance = COALESCE($3, importance),
         category   = COALESCE($4, category),
         qdrant_id  = COALESCE($5, qdrant_id)
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        updates.content    || null,
        updates.importance || null,
        updates.category   || null,
        (updates as any).qdrantId || null,
      ]
    )
    return this.toMemoryUnit(result.rows[0])
  }

  // ─── SOFT DELETE ─────────────────────────────────────────
  async delete(id: string): Promise<void> {
    await pool.query(
      `UPDATE memories 
       SET deleted_at = NOW() 
       WHERE id = $1`,
      [id]
    )
  }

  // ─── HELPER: convert DB row → MemoryUnit ─────────────────
  private toMemoryUnit(row: any): MemoryUnit {
    return {
      id:         row.id,
      userId:     row.user_id,
      type:       row.type,
      content:    row.content,
      category:   row.category,
      source:     row.source,
      sourceRef:  row.source_ref,
      importance: row.importance,
      eventDate:  row.event_date,
      dueDate:    row.due_date,
      createdAt:  row.created_at,
      accessedAt: row.accessed_at,
      deletedAt:  row.deleted_at,
    }
  }
  async hybridSearch(params: {
    userId:    string
    keyword?:  string
    type?:     string
    category?: string
    fromDate?: Date
    toDate?:   Date
    limit?:    number
  }): Promise<MemoryUnit[]> {
    const conditions = ['user_id = $1', 'deleted_at IS NULL']
    const values: any[] = [params.userId]
    let idx = 2

    if (params.keyword) {
      conditions.push(`content ILIKE $${idx}`)
      values.push(`%${params.keyword}%`)
      idx++
    }

    if (params.type) {
      conditions.push(`type = $${idx}`)
      values.push(params.type)
      idx++
    }

    if (params.category) {
      conditions.push(`category = $${idx}`)
      values.push(params.category)
      idx++
    }

    if (params.fromDate) {
      conditions.push(`created_at >= $${idx}`)
      values.push(params.fromDate)
      idx++
    }

    if (params.toDate) {
      conditions.push(`created_at <= $${idx}`)
      values.push(params.toDate)
      idx++
    }

    const query = `
      SELECT * FROM memories
      WHERE ${conditions.join(' AND ')}
      ORDER BY importance DESC
      LIMIT $${idx}
    `
    values.push(params.limit || 10)

    const result = await pool.query(query, values)
    return result.rows.map(this.toMemoryUnit)
  }
}