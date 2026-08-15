import { upsertVector, searchVectors, deleteVector } from '../db/qdrant'
import { v4 as uuidv4 } from 'uuid'

export class VectorRepository {

  // ─── UPSERT VECTOR ───────────────────────────────────────
  async upsert(
    memoryId: string,
    vector: number[],
    payload: object
  ): Promise<string> {
    const qdrantId = uuidv4()
    await upsertVector(qdrantId, vector, payload)
    return qdrantId
  }

  // ─── SEARCH BY MEANING ───────────────────────────────────
  async search(
    queryVector: number[],
    userId: string,
    topK: number = 10
  ): Promise<any[]> {
    return await searchVectors(queryVector, userId, topK)
  }

  // ─── DELETE VECTOR ───────────────────────────────────────
  async delete(qdrantId: string): Promise<void> {
    await deleteVector(qdrantId)
  }
}