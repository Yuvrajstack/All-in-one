import { MemoryEngine } from '../memory/MemoryEngine'
import { groqClient, LLM_MODEL } from '../config/llm'
import {
  createPersonNode,
  linkMemoryToPerson,
} from '../db/neo4j'
import neo4jDriver from '../db/neo4j'

export class RelationshipAgent {
  private memEngine = new MemoryEngine()

  // ─── BUILD RELATIONSHIP PROFILE ──────────────────────────
  async buildProfile(personName: string, userId: string): Promise<string> {
    console.log(`👥 Building profile for: ${personName}`)

    // Step 1: search all memories mentioning this person
    const results = await this.memEngine.search(
      `${personName} interaction meeting commitment`,
      userId,
      15
    )

    if (results.length === 0) {
      return `No memories found about ${personName}`
    }

    // Step 2: build context from memories
    const context = results.map((r, i) => `
[${i + 1}] type: ${r.memory.type} | date: ${r.memory.createdAt.toDateString()}
content: ${r.memory.content}
`).join('\n')

    // Step 3: generate relationship summary using LLM
    const prompt = `
You are an AI that builds relationship profiles from memories.
Based on these memories about ${personName}, create a relationship summary.

Memories:
${context}

Generate a JSON profile:
{
  "name": "${personName}",
  "role": "their job/role if known",
  "company": "their company if known",
  "howWemet": "how the user knows this person",
  "lastInteraction": "when we last talked",
  "pendingCommitments": ["list of things user owes them or they owe user"],
  "summary": "2-3 sentence relationship summary"
}

Return ONLY valid JSON. No extra text.`

    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw     = response.choices[0].message.content || '{}'
    const cleaned = raw.replace(/```json|```/g, '').trim()

    try {
      const profile = JSON.parse(cleaned)

      // Step 4: update Neo4j with rich profile
      await this.updateNeo4j(personName, profile, userId)

      return JSON.stringify(profile, null, 2)
    } catch {
      console.error('RelationshipAgent: failed to parse', raw)
      return `Found ${results.length} memories about ${personName} but could not build profile`
    }
  }

  // ─── GET ALL RELATIONSHIPS ────────────────────────────────
  async getAllRelationships(userId: string): Promise<any[]> {
    const session = neo4jDriver.session()
    try {
      const result = await session.run(
        `MATCH (m:Memory)-[:INVOLVES]->(p:Person)
         RETURN p.email as email, p.name as name, 
                p.company as company, p.role as role,
                count(m) as memoryCount
         ORDER BY memoryCount DESC`
      )
      return result.records.map(r => ({
        email:       r.get('email'),
        name:        r.get('name'),
        company:     r.get('company'),
        role:        r.get('role'),
        memoryCount: r.get('memoryCount').toNumber()
      }))
    } finally {
      await session.close()
    }
  }

  // ─── UPDATE NEO4J WITH RICH PROFILE ──────────────────────
  private async updateNeo4j(
    personName: string,
    profile:    any,
    userId:     string
  ): Promise<void> {
    const session = neo4jDriver.session()
    try {
      await session.run(
        `MERGE (p:Person {name: $name})
         SET p.role    = $role,
             p.company = $company,
             p.summary = $summary
        `,
        {
          name:    personName,
          role:    profile.role    || '',
          company: profile.company || '',
          summary: profile.summary || '',
        }
      )

      // link company
      if (profile.company) {
        await session.run(
          `MERGE (p:Person {name: $name})
           MERGE (c:Company {name: $company})
           MERGE (p)-[:WORKS_AT]->(c)`,
          { name: personName, company: profile.company }
        )
      }

      console.log(`👥 Neo4j profile updated for: ${personName}`)
    } finally {
      await session.close()
    }
  }
}