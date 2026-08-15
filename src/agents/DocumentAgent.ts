import { MemoryEngine } from '../memory/MemoryEngine'
import { PriorityEngine } from '../priority/PriorityEngine'
import { CreateMemoryInput } from '../types'
import { groqClient, LLM_MODEL } from '../config/llm'

interface DocumentInput {
  title:   string       // "resume.pdf", "project-notes.md"
  content: string       // raw text content
  type:    'pdf' | 'markdown' | 'text'
}

export class DocumentAgent {
  private memEngine = new MemoryEngine()
  private priority  = new PriorityEngine()

  private CHUNK_SIZE    = 500   // words per chunk
  private CHUNK_OVERLAP = 50    // overlapping words between chunks

  // ─── MAIN PROCESS ────────────────────────────────────────
  async process(doc: DocumentInput, userId: string): Promise<void> {
    console.log(`📄 DocumentAgent processing: ${doc.title}`)

    // Step 1: chunk the document
    const chunks = this.chunk(doc.content)
    console.log(`📄 Split into ${chunks.length} chunks`)

    // Step 2: store each chunk as a memory
    for (let i = 0; i < chunks.length; i++) {
      const summary = await this.summarizeChunk(chunks[i], doc.title, i)

      const importance = this.priority.calculate({
        daysSinceCreated: 0,
        accessCount:      0,
        maxAccessCount:   1,
        emotionalWeight:  0.5,
        source:           'manual'
      })

      const input: CreateMemoryInput = {
        userId,
        type:      'fact',
        content:   `[${doc.title} | chunk ${i + 1}/${chunks.length}] ${summary}`,
        category:  'general',
        source:    'manual',
        sourceRef: doc.title,
        importance,
      }

      await this.memEngine.store(input)
      console.log(`📄 Stored chunk ${i + 1}/${chunks.length}`)
    }

    console.log(`📄 Document processing complete: ${doc.title}`)
  }

  // ─── CHUNK DOCUMENT ──────────────────────────────────────
  private chunk(content: string): string[] {
    const words  = content.split(' ')
    const chunks = []

    for (let i = 0; i < words.length; i += this.CHUNK_SIZE - this.CHUNK_OVERLAP) {
      const chunk = words.slice(i, i + this.CHUNK_SIZE).join(' ')
      if (chunk.trim()) chunks.push(chunk)
    }

    return chunks
  }

  // ─── SUMMARIZE CHUNK ─────────────────────────────────────
  private async summarizeChunk(
    chunk:    string,
    docTitle: string,
    index:    number
  ): Promise<string> {
    const prompt = `
Summarize this section from "${docTitle}" in 2-3 clear sentences.
Preserve all important facts, names, dates, and numbers.

Section ${index + 1}:
${chunk}

Return ONLY the summary text. No extra formatting.`

    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })

    return response.choices[0].message.content?.trim() || chunk.slice(0, 200)
  }
}