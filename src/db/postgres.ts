import { Pool } from 'pg'
import { config } from '../config'

// In-Memory database store
export const inMemoryDB = {
  users: [] as any[],
  memories: [] as any[],
  tasks: [] as any[],
  events: [] as any[],
  projects: [] as any[],
  whatsappSessions: new Map<string, string>(),
}

let useInMemory = false

// Helper to match queries and return mock responses
class InMemoryPool {
  async query(text: string, values: any[] = []): Promise<{ rows: any[] }> {
    const sql = text.trim().replace(/\s+/g, ' ');
    const lowerSql = sql.toLowerCase();

    if (lowerSql.includes('whatsapp_auth_sessions')) {
      if (lowerSql.startsWith('create table')) {
        return { rows: [] }
      }
      if (lowerSql.startsWith('select filename, content')) {
        const rows = Array.from(inMemoryDB.whatsappSessions.entries()).map(([filename, content]) => ({ filename, content }))
        return { rows }
      }
      if (lowerSql.startsWith('insert into whatsapp_auth_sessions')) {
        inMemoryDB.whatsappSessions.set(values[0], values[1])
        return { rows: [] }
      }
    }

    // SELECT 1
    if (sql === 'SELECT 1') {
      return { rows: [{ 1: 1 }] }
    }

    // SELECT NOW()
    if (lowerSql.startsWith('select now()')) {
      return { rows: [{ now: new Date() }] }
    }

    // --- USERS ---
    if (lowerSql.startsWith('insert into users')) {
      // INSERT INTO users (email, display_name, timezone) VALUES ($1, $2, $3) RETURNING *
      const user = {
        id:           require('uuid').v4(),
        email:        values[0],
        display_name: values[1] || null,
        timezone:     values[2] || 'Asia/Kolkata',
        created_at:   new Date(),
        deleted_at:   null
      }
      inMemoryDB.users.push(user)
      return { rows: [user] }
    }

    if (lowerSql.startsWith('select * from users where email = $1')) {
      const user = inMemoryDB.users.find(u => u.email === values[0] && !u.deleted_at)
      return { rows: user ? [user] : [] }
    }

    if (lowerSql.startsWith('select * from users where id = $1')) {
      const user = inMemoryDB.users.find(u => u.id === values[0] && !u.deleted_at)
      return { rows: user ? [user] : [] }
    }

    // --- MEMORIES ---
    if (lowerSql.startsWith('insert into memories')) {
      // INSERT INTO memories (id, user_id, type, content, category, source, source_ref, importance, event_date, due_date)
      const memory = {
        id:           values[0],
        user_id:      values[1],
        type:         values[2],
        content:      values[3],
        category:     values[4] || null,
        source:       values[5],
        source_ref:   values[6] || null,
        importance:   values[7] ?? 0.5,
        event_date:   values[8] ? new Date(values[8]) : null,
        due_date:     values[9] ? new Date(values[9]) : null,
        qdrant_id:    null,
        created_at:   new Date(),
        accessed_at:  null,
        deleted_at:   null
      }
      inMemoryDB.memories.push(memory)
      return { rows: [memory] }
    }

    if (lowerSql.startsWith('select * from memories where id = $1')) {
      const memory = inMemoryDB.memories.find(m => m.id === values[0] && !m.deleted_at)
      if (memory) {
        memory.accessed_at = new Date()
      }
      return { rows: memory ? [memory] : [] }
    }

    if (lowerSql.startsWith('update memories set accessed_at = now() where id = $1')) {
      const memory = inMemoryDB.memories.find(m => m.id === values[0])
      if (memory) memory.accessed_at = new Date()
      return { rows: [] }
    }

    if (lowerSql.startsWith('update memories set content = coalesce($2, content)')) {
      // UPDATE memories SET content = COALESCE($2, content), importance = COALESCE($3, importance), category = COALESCE($4, category), qdrant_id = COALESCE($5, qdrant_id) WHERE id = $1 AND deleted_at IS NULL RETURNING *
      const memory = inMemoryDB.memories.find(m => m.id === values[0] && !m.deleted_at)
      if (memory) {
        if (values[1] !== null && values[1] !== undefined) memory.content = values[1]
        if (values[2] !== null && values[2] !== undefined) memory.importance = values[2]
        if (values[3] !== null && values[3] !== undefined) memory.category = values[3]
        if (values[4] !== null && values[4] !== undefined) memory.qdrant_id = values[4]
      }
      return { rows: memory ? [memory] : [] }
    }

    if (lowerSql.startsWith('update memories set deleted_at = now() where id = $1')) {
      const memory = inMemoryDB.memories.find(m => m.id === values[0])
      if (memory) memory.deleted_at = new Date()
      return { rows: [] }
    }

    // Dynamic Select query for memories
    if (lowerSql.includes('from memories')) {
      const userId = values[0]
      let filtered = inMemoryDB.memories.filter(m => m.user_id === userId && !m.deleted_at)

      // apply type filter if present in query
      if (lowerSql.includes('type = $')) {
        // find type parameter index
        const match = lowerSql.match(/type = \$(\d+)/)
        if (match) {
          const idx = parseInt(match[1]) - 1
          filtered = filtered.filter(m => m.type === values[idx])
        }
      }

      // apply category filter
      if (lowerSql.includes('category = $')) {
        const match = lowerSql.match(/category = \$(\d+)/)
        if (match) {
          const idx = parseInt(match[1]) - 1
          filtered = filtered.filter(m => m.category === values[idx])
        }
      }

      // apply keyword filter (ILIKE)
      if (lowerSql.includes('content ilike $')) {
        const match = lowerSql.match(/content ilike \$(\d+)/)
        if (match) {
          const idx = parseInt(match[1]) - 1
          const term = values[idx].replace(/%/g, '').toLowerCase()
          filtered = filtered.filter(m => m.content.toLowerCase().includes(term))
        }
      }

      // check if it's importance filters for forgetting / summarization
      if (lowerSql.includes('importance < 0.1')) {
        filtered = filtered.filter(m => m.importance < 0.1)
      } else if (lowerSql.includes('importance < 0.3')) {
        filtered = filtered.filter(m => m.importance < 0.3)
      }

      // order by importance desc or created_at asc
      if (lowerSql.includes('order by importance desc')) {
        filtered.sort((a, b) => b.importance - a.importance)
      } else if (lowerSql.includes('order by created_at asc')) {
        filtered.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      }

      // limit check
      const limitMatch = lowerSql.match(/limit \$(\d+)/)
      if (limitMatch) {
        const limitIdx = parseInt(limitMatch[1]) - 1
        const limit = values[limitIdx]
        filtered = filtered.slice(0, limit)
      } else if (lowerSql.includes('limit 20')) {
        filtered = filtered.slice(0, 20)
      }

      return { rows: filtered }
    }

    // --- TASKS ---
    if (lowerSql.startsWith('insert into tasks')) {
      // INSERT INTO tasks (memory_id, user_id, title, description, assigned_by, status, due_date, priority) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
      const task = {
        id:          require('uuid').v4(),
        memory_id:   values[0],
        user_id:     values[1],
        title:       values[2],
        description: values[3] || null,
        assigned_by: values[4] || null,
        status:      values[5] || 'pending',
        due_date:    values[6] ? new Date(values[6]) : null,
        priority:    values[7] || 3,
        created_at:  new Date(),
        deleted_at:  null
      }
      inMemoryDB.tasks.push(task)
      return { rows: [task] }
    }

    if (lowerSql.startsWith('select * from tasks') || lowerSql.startsWith('select id, title, description')) {
      const userId = values[0]
      const tasks = inMemoryDB.tasks.filter(t => t.user_id === userId && !t.deleted_at)
      return { rows: tasks }
    }

    if (lowerSql.startsWith('update tasks set status = $2')) {
      // UPDATE tasks SET status = $2, done_at = $3 WHERE id = $1 RETURNING *
      const task = inMemoryDB.tasks.find(t => t.id === values[0])
      if (task) {
        task.status = values[1]
        task.done_at = values[2] ? new Date(values[2]) : null
      }
      return { rows: task ? [task] : [] }
    }

    // --- EVENTS ---
    if (lowerSql.startsWith('insert into events')) {
      // INSERT INTO events (memory_id, user_id, title, description, location, meeting_link, event_date, duration_minutes, attendees, event_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
      const event = {
        id:               require('uuid').v4(),
        memory_id:        values[0],
        user_id:          values[1],
        title:            values[2],
        description:      values[3] || null,
        location:         values[4] || null,
        meeting_link:     values[5] || null,
        event_date:       values[6] ? new Date(values[6]) : null,
        duration_minutes: values[7] || 60,
        attendees:        values[8] || [],
        event_type:       values[9] || 'meeting',
        created_at:       new Date(),
        deleted_at:       null
      }
      inMemoryDB.events.push(event)
      return { rows: [event] }
    }

    if (lowerSql.startsWith('select * from events')) {
      const userId = values[0]
      const events = inMemoryDB.events.filter(e => e.user_id === userId && !e.deleted_at)
      return { rows: events }
    }

    // --- PROJECTS ---
    if (lowerSql.startsWith('insert into projects')) {
      // INSERT INTO projects (memory_id, user_id, name, description, field, status, github_repo, deadline) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
      const proj = {
        id:           require('uuid').v4(),
        memory_id:    values[0],
        user_id:      values[1],
        name:         values[2],
        description:  values[3] || null,
        field:        values[4] || null,
        status:       values[5] || 'planning',
        github_repo:  values[6] || null,
        deadline:     values[7] ? new Date(values[7]) : null,
        created_at:   new Date(),
        deleted_at:   null
      }
      inMemoryDB.projects.push(proj)
      return { rows: [proj] }
    }

    if (lowerSql.startsWith('select * from projects')) {
      const userId = values[0]
      const projs = inMemoryDB.projects.filter(p => p.user_id === userId && !p.deleted_at)
      return { rows: projs }
    }

    console.warn(`[InMemoryDB] Unmatched query: ${sql}`)
    return { rows: [] }
  }

  on(event: string, handler: any) {
    // mock listener
  }

  async end() {
    // mock end
  }
}

// Instantiate PG pool
let poolInstance: any

try {
  const realPool = new Pool({
    host:     config.postgres.host,
    port:     config.postgres.port,
    database: config.postgres.database,
    user:     config.postgres.user,
    password: config.postgres.password,
  })

  // Proxy the query to catch connection errors and fallback
  poolInstance = {
    query: async (text: string, values?: any[]) => {
      if (useInMemory) {
        return await new InMemoryPool().query(text, values)
      }
      try {
        return await realPool.query(text, values)
      } catch (err: any) {
        // If connection fails, print warning and switch to in-memory mode
        if (err.message.includes('connect') || err.message.includes('auth') || err.message.includes('password')) {
          console.warn('⚠️ Postgres connection failed, switching transparently to In-Memory DB.')
          useInMemory = true
          return await new InMemoryPool().query(text, values)
        }
        throw err
      }
    },
    on: (event: string, handler: any) => {
      realPool.on(event, handler)
    },
    end: async () => {
      await realPool.end()
    }
  }

} catch (err) {
  console.warn('⚠️ Postgres creation failed, using In-Memory DB.')
  useInMemory = true
  poolInstance = new InMemoryPool()
}

export default poolInstance