import axios from 'axios'

const QDRANT_URL = 'http://localhost:6333'

export const COLLECTION_NAME = 'memories'
export const VECTOR_SIZE = 384

// In-Memory Vector Store fallback
export const inMemoryVectors: Array<{ id: string; vector: number[]; payload: any }> = []
let useMockVectors = false

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  if (magA === 0 || magB === 0) return 0
  return dot / (magA * magB)
}

export async function initQdrantCollection(): Promise<void> {
  if (useMockVectors) return

  try {
    const response = await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`)
      .catch(() => null)

    if (!response) {
      await axios.put(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        vectors: {
          size:     VECTOR_SIZE,
          distance: 'Cosine',
        }
      })
      console.log(`Qdrant collection '${COLLECTION_NAME}' created`)
    } else {
      console.log(`Qdrant collection '${COLLECTION_NAME}' already exists`)
    }
  } catch (err: any) {
    console.warn('⚠️ Qdrant connection failed, switching transparently to In-Memory Vector DB.')
    useMockVectors = true
  }
}

export async function upsertVector(
  id: string,
  vector: number[],
  payload: object
): Promise<void> {
  if (useMockVectors) {
    const idx = inMemoryVectors.findIndex(v => v.id === id)
    if (idx !== -1) {
      inMemoryVectors[idx] = { id, vector, payload }
    } else {
      inMemoryVectors.push({ id, vector, payload })
    }
    return
  }

  try {
    await axios.put(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
      points: [{ id, vector, payload }]
    })
  } catch (err: any) {
    console.warn('⚠️ Qdrant write failed, writing to In-Memory Vector DB.')
    useMockVectors = true
    await upsertVector(id, vector, payload)
  }
}

export async function searchVectors(
  vector: number[],
  userId: string,
  topK: number
): Promise<any[]> {
  if (useMockVectors) {
    // Filter vectors by userId
    const userVectors = inMemoryVectors.filter(v => v.payload?.user_id === userId)
    // Compute cosine similarity
    const results = userVectors.map(v => {
      const score = cosineSimilarity(vector, v.vector)
      return {
        id:      v.id,
        score,
        payload: v.payload
      }
    })
    // Sort descending by score
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  try {
    const response = await axios.post(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`,
      {
        vector,
        limit:        topK,
        filter:       { must: [{ key: 'user_id', match: { value: userId } }] },
        with_payload: true,
      }
    )
    return response.data.result
  } catch (err: any) {
    console.warn('⚠️ Qdrant search failed, falling back to In-Memory Vector DB search.')
    useMockVectors = true
    return await searchVectors(vector, userId, topK)
  }
}

export async function deleteVector(id: string): Promise<void> {
  if (useMockVectors) {
    const idx = inMemoryVectors.findIndex(v => v.id === id)
    if (idx !== -1) {
      inMemoryVectors.splice(idx, 1)
    }
    return
  }

  try {
    await axios.post(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete`,
      { points: [id] }
    )
  } catch (err: any) {
    console.warn('⚠️ Qdrant delete failed, deleting from In-Memory Vector DB.')
    useMockVectors = true
    await deleteVector(id)
  }
}