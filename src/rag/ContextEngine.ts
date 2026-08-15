import { MemoryEngine } from '../memory/MemoryEngine'
import { groqClient, LLM_MODEL } from '../config/llm'
import neo4jDriver from '../db/neo4j'
import { MemoryUnit } from '../types'

export class ContextEngine {
  private memEngine = new MemoryEngine()

  // ─── MAIN: BUILD RICH CONTEXT AND ANSWER ─────────────────
  async query(userQuery: string, userId: string): Promise<string> {
    console.log('🧠 ContextEngine building rich context...')

    // Step 1: get semantic memories
    const memoryResults = await this.memEngine.search(userQuery, userId, 10)
    const memories      = memoryResults.map(r => r.memory)

    // Step 2: get related people from Neo4j
    const people = await this.getRelatedPeople(memories)

    // Step 3: get related projects from Neo4j
    const projects = await this.getRelatedProjects(memories)

    // Step 4: get related companies from Neo4j
    const companies = await this.getRelatedCompanies(people)

    // Step 5: build rich context
    const context = this.buildRichContext(
      memories, people, projects, companies
    )

    console.log(`🧠 Context built: ${memories.length} memories, ${people.length} people, ${projects.length} projects`)

    // Step 6: generate answer with rich context
    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [
        {
          role:    'system',
          content: `You are PAC, a personal AI companion with deep knowledge of the user's life.
You have access to memories, relationships, and project context.
Always cite sources. Be specific and personalized.`
        },
        {
          role:    'user',
          content: `${context}\n\nQuestion: ${userQuery}`
        }
      ]
    })

    return response.choices[0].message.content || 'Could not generate response.'
  }

  // ─── GET RELATED PEOPLE FROM NEO4J ───────────────────────
  private async getRelatedPeople(memories: MemoryUnit[]): Promise<any[]> {
    const session = neo4jDriver.session()
    try {
      const memoryIds = memories.map(m => m.id)
      if (memoryIds.length === 0) return []

      const result = await session.run(
        `MATCH (m:Memory)-[:INVOLVES]->(p:Person)
         WHERE m.id IN $memoryIds
         RETURN DISTINCT p.email as email, p.name as name,
                p.role as role, p.company as company`,
        { memoryIds }
      )

      return result.records.map(r => ({
        email:   r.get('email'),
        name:    r.get('name'),
        role:    r.get('role'),
        company: r.get('company'),
      }))
    } finally {
      await session.close()
    }
  }

  // ─── GET RELATED PROJECTS FROM NEO4J ─────────────────────
  private async getRelatedProjects(memories: MemoryUnit[]): Promise<any[]> {
    const session = neo4jDriver.session()
    try {
      const memoryIds = memories.map(m => m.id)
      if (memoryIds.length === 0) return []

      const result = await session.run(
        `MATCH (m:Memory)-[:BELONGS_TO]->(proj:Project)
         WHERE m.id IN $memoryIds
         RETURN DISTINCT proj.name as name`,
        { memoryIds }
      )

      return result.records.map(r => ({ name: r.get('name') }))
    } finally {
      await session.close()
    }
  }

  // ─── GET RELATED COMPANIES FROM NEO4J ────────────────────
  private async getRelatedCompanies(people: any[]): Promise<any[]> {
    const session = neo4jDriver.session()
    try {
      const emails = people.map(p => p.email).filter(Boolean)
      if (emails.length === 0) return []

      const result = await session.run(
        `MATCH (p:Person)-[:WORKS_AT]->(c:Company)
         WHERE p.email IN $emails
         RETURN DISTINCT c.name as company, p.email as email`,
        { emails }
      )

      return result.records.map(r => ({
        company: r.get('company'),
        email:   r.get('email'),
      }))
    } finally {
      await session.close()
    }
  }

  // ─── BUILD RICH CONTEXT ───────────────────────────────────
  private buildRichContext(
    memories:  MemoryUnit[],
    people:    any[],
    projects:  any[],
    companies: any[]
  ): string {
    let context = '=== MEMORIES ===\n'

    const sorted = memories.sort((a, b) => b.importance - a.importance)
    sorted.forEach((m, i) => {
      context += `
[MEMORY ${i + 1}]
type:       ${m.type}
source:     ${m.source}
date:       ${m.createdAt.toDateString()}
importance: ${m.importance.toFixed(2)}
content:    ${m.content}
${m.dueDate ? `due: ${m.dueDate.toDateString()}` : ''}
`
    })

    if (people.length > 0) {
      context += '\n=== RELATED PEOPLE ===\n'
      people.forEach(p => {
        context += `- ${p.name || p.email}`
        if (p.role)    context += ` (${p.role})`
        if (p.company) context += ` at ${p.company}`
        context += '\n'
      })
    }

    if (projects.length > 0) {
      context += '\n=== RELATED PROJECTS ===\n'
      projects.forEach(p => {
        context += `- ${p.name}\n`
      })
    }

    if (companies.length > 0) {
      context += '\n=== RELATED COMPANIES ===\n'
      companies.forEach(c => {
        context += `- ${c.company} (via ${c.email})\n`
      })
    }

    return context
  }
}