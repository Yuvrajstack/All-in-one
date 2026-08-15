import { MemoryEngine } from '../memory/MemoryEngine'
import { PriorityEngine } from '../priority/PriorityEngine'
import { CreateMemoryInput } from '../types'
import { groqClient, LLM_MODEL } from '../config/llm'
import {
  linkUserToJob,
  createCompanyNode,
  linkPersonToCompany
} from '../db/neo4j'

interface JobEmail {
  from:    string
  subject: string
  body:    string
  date:    string
}

interface JobExtraction {
  company:  string
  role:     string
  status:   'applied' | 'oa' | 'interview' | 'offer' | 'rejected'
  memories: any[]
}

export class JobAgent {
  private memEngine = new MemoryEngine()
  private priority  = new PriorityEngine()

  async process(email: JobEmail, userId: string): Promise<void> {
    console.log('💼 JobAgent processing email...')
    const extracted = await this.extract(email)

    if (!extracted) {
      console.log('💼 Not a job related email, skipping')
      return
    }

    console.log(`💼 Job: ${extracted.company} | ${extracted.role} | ${extracted.status}`)

    // save memories
    for (const item of extracted.memories) {
      const importance = this.priority.calculate({
        daysSinceCreated: 0,
        accessCount:      0,
        maxAccessCount:   1,
        emotionalWeight:  item.emotionalWeight || 0.7,
        source:           'gmail'
      })

      const input: CreateMemoryInput = {
        userId,
        type:      item.type,
        content:   item.content,
        category:  item.category || 'interview',
        source:    'gmail',
        sourceRef: email.from,
        importance,
        eventDate: item.eventDate ? new Date(item.eventDate) : undefined,
        dueDate:   item.dueDate   ? new Date(item.dueDate)   : undefined,
      }

      await this.memEngine.store(input)
    }

    // update Neo4j graph
    await createCompanyNode(extracted.company)
    await linkUserToJob(userId, extracted.company, extracted.role, extracted.status)
    console.log(`💼 Neo4j: User → ${extracted.company} (${extracted.role}) [${extracted.status}]`)
  }

  private async extract(email: JobEmail): Promise<JobExtraction | null> {
    const prompt = `
You are an AI that extracts job application information from emails.
Analyze this email and return a JSON object.

Email:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Body: ${email.body}

If this is NOT a job related email, return: { "isJobEmail": false }

If it IS a job email, return:
{
  "isJobEmail": true,
  "company": "company name",
  "role": "job role/title",
  "status": "applied" | "oa" | "interview" | "offer" | "rejected",
  "memories": [
    {
      "type": "fact" | "task" | "event",
      "content": "clear description",
      "category": "interview" | "deadline" | "general",
      "emotionalWeight": 0.8,
      "eventDate": "ISO date or null",
      "dueDate": "ISO date or null"
    }
  ]
}

Status guide:
- "applied"   → application confirmation
- "oa"        → online assessment invitation
- "interview" → interview invitation
- "offer"     → job offer
- "rejected"  → rejection email

Return ONLY valid JSON. No extra text.`

    console.log('💼 Calling Groq API...')
    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })
    console.log('💼 Groq responded!')

    const raw     = response.choices[0].message.content || '{}'
    const cleaned = raw.replace(/```json|```/g, '').trim()

    try {
      const parsed = JSON.parse(cleaned)
      if (!parsed.isJobEmail) return null
      return parsed
    } catch {
      console.error('JobAgent: failed to parse LLM response', raw)
      return null
    }
  }
}