import { MemoryEngine } from '../memory/MemoryEngine'
import { MemoryUnit } from '../types'
import { ContextEngine } from './ContextEngine'

export class RAGPipeline {
  private memEngine     = new MemoryEngine()
  private contextEngine = new ContextEngine()

  // ─── MAIN QUERY ──────────────────────────────────────────
  async query(userQuery: string, userId: string): Promise<string> {
    // use ContextEngine for rich context-aware answers
    return await this.contextEngine.query(userQuery, userId)
  }

  // ─── BUILD STRUCTURED CONTEXT (kept for reference) ───────
  private buildContext(memories: MemoryUnit[]): string {
    const sorted = memories.sort((a, b) => b.importance - a.importance)

    return sorted.map((m, index) => `
[MEMORY ${index + 1}]
type:       ${m.type}
source:     ${m.source}
date:       ${m.createdAt.toDateString()}
importance: ${m.importance}
content:    ${m.content}
${m.dueDate ? `due: ${m.dueDate.toDateString()}` : ''}
`).join('\n---\n')
  }
}