import { groqClient, LLM_MODEL } from '../config/llm'
import {
  createPersonNode,
  linkMemoryToPerson,
  linkMemoryToProject
} from '../db/neo4j'

interface Classification {
  people:   string[]  // email or name
  projects: string[]  // project names
}

export class ClassificationService {

  // ─── CLASSIFY A MEMORY ───────────────────────────────────
  async classify(memoryId: string, content: string): Promise<Classification> {
    console.log('🧠 Classifying memory...')

    const prompt = `
Analyze this text and extract:
1. People mentioned (emails or full names)
2. Project names mentioned (software projects, repos, codebases)

Text: "${content}"

Return ONLY valid JSON. No extra text:
{
  "people": ["email@example.com", "John Doe"],
  "projects": ["ProjectName", "repo-name"]
}

If none found, return empty arrays.`

    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw     = response.choices[0].message.content || '{}'
    const cleaned = raw.replace(/```json|```/g, '').trim()

    try {
      const parsed: Classification = JSON.parse(cleaned)

      // save to Neo4j
      await this.saveToGraph(memoryId, parsed)

      return parsed
    } catch {
      console.error('ClassificationService: failed to parse', raw)
      return { people: [], projects: [] }
    }
  }

  // ─── SAVE TO NEO4J GRAPH ─────────────────────────────────
  private async saveToGraph(
    memoryId: string,
    classification: Classification
  ): Promise<void> {

    // create person nodes and link to memory
    for (const person of classification.people) {
      await createPersonNode(person)
      await linkMemoryToPerson(memoryId, person)
      console.log(`🧠 Linked memory → Person: ${person}`)
    }

    // create project nodes and link to memory
    for (const project of classification.projects) {
      await linkMemoryToProject(memoryId, project)
      console.log(`🧠 Linked memory → Project: ${project}`)
    }
  }
}