export class EmbeddingService {

  async embed(text: string): Promise<number[]> {
    // temporary: generate deterministic fake vector for testing
    // replace with real embeddings later
    const vector = new Array(384).fill(0).map((_, i) => {
      let hash = 0
      for (let j = 0; j < text.length; j++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(j) + i
        hash |= 0
      }
      return (hash % 1000) / 1000
    })
    return vector
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return await Promise.all(texts.map(t => this.embed(t)))
  }
}