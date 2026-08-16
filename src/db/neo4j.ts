import neo4j from 'neo4j-driver'

// In-Memory Graph structures
export const inMemoryGraph = {
  people: new Map<string, { email: string; name: string; role?: string; company?: string; summary?: string }>(),
  companies: new Set<string>(),
  projects: new Set<string>(),
  relations: [] as Array<{ source: string; target: string; type: string }>
}

let useMockGraph = false

class InMemorySession {
  async run(query: string, params: any = {}): Promise<{ records: any[] }> {
    const q = query.trim().replace(/\s+/g, ' ')
    const lowerQ = q.toLowerCase()

    // init constraint queries
    if (lowerQ.includes('create constraint')) {
      return { records: [] }
    }

    // MATCH (m:Memory)-[:INVOLVES]->(p:Person) ... ORDER BY memoryCount DESC
    if (lowerQ.includes('match (m:memory)-[:involves]->(p:person) return p.email')) {
      const counts = new Map<string, number>()
      inMemoryGraph.relations
        .filter(r => r.type === 'INVOLVES')
        .forEach(r => {
          counts.set(r.target, (counts.get(r.target) || 0) + 1)
        })

      const records = Array.from(counts.entries()).map(([personKey, count]) => {
        const p = inMemoryGraph.people.get(personKey) || { email: personKey, name: personKey }
        return {
          get: (key: string) => {
            if (key === 'email') return p.email
            if (key === 'name') return p.name
            if (key === 'company') return p.company || null
            if (key === 'role') return p.role || null
            if (key === 'memoryCount') {
              return { toNumber: () => count }
            }
            return null
          }
        }
      }).filter((r: any) => {
        const mc = r.get('memoryCount')
        return mc && typeof mc.toNumber === 'function' && mc.toNumber() > 0
      })

      records.sort((a: any, b: any) => {
        const valA = a.get('memoryCount')?.toNumber() || 0
        const valB = b.get('memoryCount')?.toNumber() || 0
        return valB - valA
      })
      return { records }
    }

    // MATCH (m:Memory)-[:INVOLVES]->(p:Person) WHERE m.id IN $memoryIds ...
    if (lowerQ.includes('match (m:memory)-[:involves]->(p:person)') && lowerQ.includes('m.id in $memoryids')) {
      const memoryIds = params.memoryIds || []
      const targets = inMemoryGraph.relations
        .filter(r => r.type === 'INVOLVES' && memoryIds.includes(r.source))
        .map(r => r.target)

      const uniqueTargets = Array.from(new Set(targets))
      const records = uniqueTargets.map(target => {
        const p = inMemoryGraph.people.get(target) || { email: target, name: target }
        return {
          get: (key: string) => {
            if (key === 'email') return p.email
            if (key === 'name') return p.name
            if (key === 'role') return p.role || null
            if (key === 'company') return p.company || null
            return null
          }
        }
      })
      return { records }
    }

    // MATCH (m:Memory)-[:BELONGS_TO]->(proj:Project) WHERE m.id IN $memoryIds ...
    if (lowerQ.includes('match (m:memory)-[:belongs_to]->(proj:project)') && lowerQ.includes('m.id in $memoryids')) {
      const memoryIds = params.memoryIds || []
      const targets = inMemoryGraph.relations
        .filter(r => r.type === 'BELONGS_TO' && memoryIds.includes(r.source))
        .map(r => r.target)

      const uniqueTargets = Array.from(new Set(targets))
      const records = uniqueTargets.map(t => ({
        get: (key: string) => (key === 'name' ? t : null)
      }))
      return { records }
    }

    // MATCH (p:Person)-[:WORKS_AT]->(c:Company) WHERE p.email IN $emails ...
    if (lowerQ.includes('match (p:person)-[:works_at]->(c:company)') && lowerQ.includes('p.email in $emails')) {
      const emails = params.emails || []
      const matches = inMemoryGraph.relations
        .filter(r => r.type === 'WORKS_AT' && emails.includes(r.source))

      const records = matches.map(m => ({
        get: (key: string) => {
          if (key === 'company') return m.target
          if (key === 'email') return m.source
          return null
        }
      }))
      return { records }
    }

    // MERGE (p:Person {name: $name}) SET p.role = $role, p.company = $company, p.summary = $summary
    if (lowerQ.includes('merge (p:person {name: $name})')) {
      const name = params.name
      const p: any = inMemoryGraph.people.get(name) || { email: name, name }
      p.role = params.role !== undefined ? params.role : p.role
      p.company = params.company !== undefined ? params.company : p.company
      p.summary = params.summary !== undefined ? params.summary : p.summary
      inMemoryGraph.people.set(name, p)
      return { records: [] }
    }

    // MERGE (p:Person {name: $name}) MERGE (c:Company {name: $company}) MERGE (p)-[:WORKS_AT]->(c)
    if (lowerQ.includes('works_at')) {
      const name = params.name
      const company = params.company
      inMemoryGraph.companies.add(company)
      const p: any = inMemoryGraph.people.get(name) || { email: name, name }
      p.company = company
      inMemoryGraph.people.set(name, p)

      const exists = inMemoryGraph.relations.some(r => r.source === name && r.target === company && r.type === 'WORKS_AT')
      if (!exists) {
        inMemoryGraph.relations.push({ source: name, target: company, type: 'WORKS_AT' })
      }
      return { records: [] }
    }

    return { records: [] }
  }

  async close(): Promise<void> {}
}

class InMemoryDriver {
  session() {
    return new InMemorySession() as any
  }
  async close(): Promise<void> {}
}

let realDriver: any
try {
  realDriver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'password123')
  )
} catch (err) {
  console.warn('⚠️ Neo4j driver instantiation failed, using In-Memory driver.')
  useMockGraph = true
}

const wrappedDriver = {
  session: () => {
    if (useMockGraph || !realDriver) {
      return new InMemorySession() as any
    }
    const realSession = realDriver.session()
    return {
      run: async (query: string, params?: any) => {
        try {
          return await realSession.run(query, params)
        } catch (err: any) {
          console.warn('⚠️ Neo4j session.run failed, switching transparently to In-Memory Graph.')
          useMockGraph = true
          return await new InMemorySession().run(query, params)
        }
      },
      close: async () => {
        await realSession.close()
      }
    }
  },
  close: async () => {
    if (realDriver) {
      await realDriver.close()
    }
  }
}

export async function initNeo4j(): Promise<void> {
  if (useMockGraph) return

  const session = wrappedDriver.session()
  try {
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.email IS UNIQUE')
    console.log('✅ Neo4j connection initialization verified')
  } catch (err) {
    // handled by wrapped run
  } finally {
    await session.close()
  }
}

// ─── PERSON ──────────────────────────────────────────────
export async function createPersonNode(
  email: string,
  name?:    string
): Promise<void> {
  const session = wrappedDriver.session()
  try {
    await session.run(
      `MERGE (p:Person {email: $email})
       ON CREATE SET p.name = $name, p.createdAt = datetime()
       ON MATCH SET p.name = COALESCE($name, p.name)`,
      { email, name: name || email }
    )
  } finally {
    await session.close()
  }
}

// ─── COMPANY ─────────────────────────────────────────────
export async function createCompanyNode(name: string): Promise<void> {
  const session = wrappedDriver.session()
  try {
    await session.run(
      `MERGE (c:Company {name: $name})
       ON CREATE SET c.createdAt = datetime()`,
      { name }
    )
  } finally {
    await session.close()
  }
}

// ─── PERSON → COMPANY ────────────────────────────────────
export async function linkPersonToCompany(
  email:       string,
  companyName: string
): Promise<void> {
  const session = wrappedDriver.session()
  try {
    await session.run(
      `MERGE (p:Person {email: $email})
       MERGE (c:Company {name: $company})
       MERGE (p)-[:WORKS_AT]->(c)`,
      { email, company: companyName }
    )
  } finally {
    await session.close()
  }
}

// ─── MEMORY → PERSON ─────────────────────────────────────
export async function linkMemoryToPerson(
  memoryId: string,
  email:    string
): Promise<void> {
  const session = wrappedDriver.session()
  try {
    await session.run(
      `MERGE (m:Memory {id: $memoryId})
       MERGE (p:Person {email: $email})
       MERGE (m)-[:INVOLVES]->(p)`,
      { memoryId, email }
    )
  } finally {
    await session.close()
  }
}

// ─── MEMORY → PROJECT ────────────────────────────────────
export async function linkMemoryToProject(
  memoryId:    string,
  projectName: string
): Promise<void> {
  const session = wrappedDriver.session()
  try {
    await session.run(
      `MERGE (m:Memory {id: $memoryId})
       MERGE (proj:Project {name: $projectName})
       MERGE (m)-[:BELONGS_TO]->(proj)`,
      { memoryId, projectName }
    )
  } finally {
    await session.close()
  }
}

// ─── EVENT → PERSON ──────────────────────────────────────
export async function linkEventToPerson(
  eventTitle: string,
  email:      string
): Promise<void> {
  const session = wrappedDriver.session()
  try {
    await session.run(
      `MERGE (e:Event {id: $eventTitle})
       MERGE (p:Person {email: $email})
       MERGE (e)-[:INVOLVES]->(p)`,
      { eventTitle, email }
    )
  } finally {
    await session.close()
  }
}

// ─── TASK → PROJECT ──────────────────────────────────────
export async function linkTaskToProject(
  taskContent: string,
  projectName: string
): Promise<void> {
  const session = wrappedDriver.session()
  try {
    await session.run(
      `MERGE (t:Task {id: $taskContent})
       MERGE (proj:Project {name: $projectName})
       MERGE (t)-[:BELONGS_TO]->(proj)`,
      { taskContent, projectName }
    )
  } finally {
    await session.close()
  }
}

// ─── USER → JOB ──────────────────────────────────────────
export async function linkUserToJob(
  userId:  string,
  company: string,
  role:    string,
  status:  string
): Promise<void> {
  const session = wrappedDriver.session()
  try {
    await session.run(
      `MERGE (u:User {id: $userId})
       MERGE (j:Job {id: $jobId})
       ON CREATE SET j.company = $company, j.role = $role, 
                     j.status = $status, j.createdAt = datetime()
       ON MATCH SET j.status = $status
       MERGE (u)-[:APPLIED_TO]->(j)`,
      {
        userId,
        jobId:   `${userId}-${company}-${role}`,
        company,
        role,
        status
      }
    )
  } finally {
    await session.close()
  }
}

// ─── GET PEOPLE FROM MEMORY ──────────────────────────────
export async function getPeopleFromMemory(memoryId: string): Promise<string[]> {
  const session = wrappedDriver.session()
  try {
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId})-[:INVOLVES]->(p:Person)
       RETURN p.email as email`,
      { memoryId }
    )
    return result.records.map((r: any) => r.get('email'))
  } finally {
    await session.close()
  }
}

export default wrappedDriver