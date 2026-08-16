import express from 'express'
import cors from 'cors'
import path from 'path'
import nodemailer from 'nodemailer'
import pool from './db/postgres'
import { initQdrantCollection } from './db/qdrant'
import { initNeo4j } from './db/neo4j'
import { MasterAgent } from './agents/MasterAgent'
import { IngestionPipeline } from './pipelines/IngestionPipeline'
import { WhatsAppService } from './services/WhatsAppService'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

// Serve static assets from src/public
app.use(express.static(path.join(__dirname, 'public')))

// State variables for connectors status
const connectorStatus: Record<string, { connected: boolean; lastSync: Date | null }> = {
  gmail:    { connected: false, lastSync: null },
  github:   { connected: false, lastSync: null },
  calendar: { connected: false, lastSync: null },
  document: { connected: false, lastSync: null },
  delivery: { connected: false, lastSync: null },
  whatsapp: { connected: false, lastSync: null },
}

// Audit logs array
const auditLogs: any[] = []
function logAction(action: string, details: string) {
  auditLogs.unshift({
    timestamp: new Date(),
    action,
    details
  })
}

// Credentials file path
const CREDENTIALS_FILE = path.join(__dirname, '..', 'credentials.json')
const credentialsStore = {
  githubUsername: '',
  githubToken: '',
  gmailUser: '',
  gmailPassword: '',
  calendarUrl: '',
  whatsappNumber: '',
  whatsappApiKey: '',
  whatsappAutoReply: false,
  whatsappAllowedContacts: '',
}

// Helper to load credentials from file or .env fallback
function loadStoredCredentials() {
  const fs = require('fs')
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'))
      Object.assign(credentialsStore, data)
      console.log('✅ Loaded integration credentials from credentials.json')
    } catch (err: any) {
      console.error('Failed to parse credentials.json:', err.message)
    }
  } else {
    // fallback to env
    credentialsStore.githubUsername = process.env.GITHUB_USERNAME || ''
    credentialsStore.githubToken = process.env.GITHUB_TOKEN || ''
    credentialsStore.gmailUser = process.env.GMAIL_USER || ''
    credentialsStore.gmailPassword = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || ''
    credentialsStore.calendarUrl = process.env.CALENDAR_ICAL_URL || ''
    credentialsStore.whatsappNumber = process.env.WHATSAPP_NUMBER || ''
    credentialsStore.whatsappApiKey = process.env.WHATSAPP_API_KEY || ''
    credentialsStore.whatsappAutoReply = process.env.WHATSAPP_AUTO_REPLY !== 'false'
    credentialsStore.whatsappAllowedContacts = process.env.WHATSAPP_ALLOWED_CONTACTS || ''
    console.log('ℹ️ No credentials.json found, loaded defaults from .env')
  }
  WhatsAppService.getInstance().setAutoReply(credentialsStore.whatsappAutoReply)
}

function saveStoredCredentials() {
  const fs = require('fs')
  try {
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentialsStore, null, 2), 'utf8')
    console.log('✅ Saved integration credentials to credentials.json')
  } catch (err: any) {
    console.error('Failed to save credentials.json:', err.message)
  }
}

// Call on startup
loadStoredCredentials()

// Unified initialization
async function init() {
  try {
    await pool.query('SELECT 1')
    await initQdrantCollection()
    await initNeo4j()
    console.log('✅ All services initialized successfully')
  } catch (err: any) {
    console.warn('⚠️ Initialization warning:', err.message)
  }

  // Auto-start WhatsApp engine on server boot
  try {
    const waService = WhatsAppService.getInstance()
    waService.setAutoReply(credentialsStore.whatsappAutoReply)
    console.log('📱 Auto-starting WhatsApp Web Service on boot...')
    waService.initConnection().catch((err: any) => console.error('WhatsApp init error:', err.message))
  } catch (err: any) {
    console.error('Failed to start WhatsApp Service:', err.message)
  }
}

// ─── AUTHENTICATION ROUTES ───────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { email, displayName } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required' })

  try {
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' })
    }

    const result = await pool.query(
      'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING *',
      [email, displayName || email]
    )
    logAction('REGISTER', `User ${email} registered.`)
    res.json({ user: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required' })

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    logAction('LOGIN', `User ${email} logged in.`)
    res.json({ user: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── DASHBOARD DATA API ──────────────────────────────────────

app.get('/api/dashboard', async (req, res) => {
  const userId = req.query.userId as string
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  try {
    // 1. Fetch user's memories
    const memoriesRes = await pool.query(
      'SELECT * FROM memories WHERE user_id = $1 AND deleted_at IS NULL ORDER BY importance DESC',
      [userId]
    )
    const memories = memoriesRes.rows

    // 2. Fetch tasks
    const tasksRes = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1 AND deleted_at IS NULL ORDER BY due_date ASC',
      [userId]
    )

    // 3. Fetch events
    const eventsRes = await pool.query(
      'SELECT * FROM events WHERE user_id = $1 AND deleted_at IS NULL ORDER BY event_date ASC',
      [userId]
    )

    // 4. Fetch projects
    const projectsRes = await pool.query(
      'SELECT * FROM projects WHERE user_id = $1 AND deleted_at IS NULL',
      [userId]
    )

    // Filter items
    const alerts = memories.filter((m: any) => m.importance >= 0.8)
    const importantToday = memories.filter((m: any) => m.importance >= 0.7 && m.type !== 'task' && m.type !== 'event')

    // AI recommendation based on memories
    let aiRec = 'Welcome back! Ingest some digital sources (Gmail, GitHub, Calendar) to see dynamic, prioritized AI recommendations based on your schedule.'
    if (alerts.length > 0) {
      const highest = alerts[0]
      aiRec = `Based on your digital life, you have a critical item: "${highest.content}". You should focus on preparing for this immediately.`
    } else if (memories.length > 0) {
      aiRec = 'Everything is running smoothly! Keep up the great work and review your scheduled items below.'
    }

    res.json({
      importantToday,
      alerts,
      tasks: tasksRes.rows,
      events: eventsRes.rows,
      projects: projectsRes.rows,
      aiRecommendation: aiRec
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── MEMORIES APIS ───────────────────────────────────────────

app.get('/api/memories', async (req, res) => {
  const userId = req.query.userId as string
  const type = req.query.type as string
  const category = req.query.category as string
  const keyword = req.query.keyword as string

  if (!userId) return res.status(400).json({ error: 'userId is required' })

  try {
    const conditions = ['user_id = $1', 'deleted_at IS NULL']
    const values: any[] = [userId]
    let idx = 2

    if (type) {
      conditions.push(`type = $${idx}`)
      values.push(type)
      idx++
    }
    if (category) {
      conditions.push(`category = $${idx}`)
      values.push(category)
      idx++
    }
    if (keyword) {
      conditions.push(`content ILIKE $${idx}`)
      values.push(`%${keyword}%`)
      idx++
    }

    const query = `
      SELECT * FROM memories 
      WHERE ${conditions.join(' AND ')} 
      ORDER BY importance DESC
    `
    const result = await pool.query(query, values)
    res.json({ memories: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/memories/:id', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query('UPDATE memories SET deleted_at = NOW() WHERE id = $1', [id])
    logAction('DELETE_MEMORY', `Deleted memory ID: ${id}`)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/memories/optimize', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  try {
    const master = new MasterAgent()
    const answer = await master.query('optimize memory', userId)
    logAction('OPTIMIZE_MEMORY', 'Executed memory optimization pipeline.')
    res.json({ message: answer })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── TASKS APIS ──────────────────────────────────────────────

app.get('/api/tasks', async (req, res) => {
  const userId = req.query.userId as string
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  try {
    const result = await pool.query('SELECT * FROM tasks WHERE user_id = $1 AND deleted_at IS NULL', [userId])
    res.json({ tasks: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/tasks', async (req, res) => {
  const { userId, title, description, dueDate, priority } = req.body
  if (!userId || !title) return res.status(400).json({ error: 'userId and title are required' })

  try {
    const result = await pool.query(
      `INSERT INTO tasks (memory_id, user_id, title, description, status, due_date, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [null, userId, title, description || null, 'pending', dueDate ? new Date(dueDate) : null, priority || 3]
    )
    logAction('CREATE_TASK', `Created manual task: "${title}"`)
    res.json({ task: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/tasks/:id/status', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  if (!status) return res.status(400).json({ error: 'status is required' })

  try {
    const doneAt = status === 'completed' ? new Date() : null
    const result = await pool.query(
      'UPDATE tasks SET status = $2, done_at = $3 WHERE id = $1 RETURNING *',
      [id, status, doneAt]
    )
    logAction('UPDATE_TASK_STATUS', `Updated task ID ${id} to ${status}`)
    res.json({ task: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── EVENTS APIS ─────────────────────────────────────────────

app.get('/api/events', async (req, res) => {
  const userId = req.query.userId as string
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  try {
    const result = await pool.query('SELECT * FROM events WHERE user_id = $1 AND deleted_at IS NULL', [userId])
    res.json({ events: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/events', async (req, res) => {
  const { userId, title, description, location, eventDate, durationMinutes, attendees, eventType } = req.body
  if (!userId || !title || !eventDate) return res.status(400).json({ error: 'userId, title and eventDate are required' })

  try {
    const result = await pool.query(
      `INSERT INTO events (memory_id, user_id, title, description, location, meeting_link, event_date, duration_minutes, attendees, event_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [null, userId, title, description || null, location || null, null, new Date(eventDate), durationMinutes || 60, attendees || [], eventType || 'meeting']
    )
    logAction('CREATE_EVENT', `Created manual event: "${title}"`)
    res.json({ event: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── PROJECTS APIS ───────────────────────────────────────────

app.get('/api/projects', async (req, res) => {
  const userId = req.query.userId as string
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  try {
    const result = await pool.query('SELECT * FROM projects WHERE user_id = $1 AND deleted_at IS NULL', [userId])
    res.json({ projects: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/projects', async (req, res) => {
  const { userId, name, description, field, status, githubRepo, deadline } = req.body
  if (!userId || !name) return res.status(400).json({ error: 'userId and name are required' })

  try {
    const result = await pool.query(
      `INSERT INTO projects (memory_id, user_id, name, description, field, status, github_repo, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [null, userId, name, description || null, field || null, status || 'planning', githubRepo || null, deadline ? new Date(deadline) : null]
    )
    logAction('CREATE_PROJECT', `Created manual project: "${name}"`)
    res.json({ project: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── CONNECTORS APIS (SIMULATED PIPELINE SYNC) ───────────────

app.get('/api/connectors', (req, res) => {
  res.json({ status: connectorStatus })
})

app.post('/api/connectors/:id/connect', (req, res) => {
  const { id } = req.params
  if (connectorStatus[id as keyof typeof connectorStatus]) {
    connectorStatus[id as keyof typeof connectorStatus].connected = true
    logAction('CONNECT', `Connected data source: ${id}`)
    return res.json({ success: true, status: connectorStatus[id as keyof typeof connectorStatus] })
  }
  res.status(404).json({ error: 'Connector not found' })
})

app.post('/api/connectors/:id/disconnect', (req, res) => {
  const { id } = req.params
  if (connectorStatus[id as keyof typeof connectorStatus]) {
    connectorStatus[id as keyof typeof connectorStatus].connected = false
    logAction('DISCONNECT', `Disconnected data source: ${id}`)
    return res.json({ success: true, status: connectorStatus[id as keyof typeof connectorStatus] })
  }
  res.status(404).json({ error: 'Connector not found' })
})

app.post('/api/connectors/:id/sync', async (req, res) => {
  const { id } = req.params
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  const status = connectorStatus[id as keyof typeof connectorStatus]
  if (!status) return res.status(404).json({ error: 'Connector not found' })

  status.connected = true // Auto-connect on sync
  status.lastSync = new Date()

  try {
    const pipeline = new IngestionPipeline()

    if (id === 'gmail') {
      const user = credentialsStore.gmailUser
      const password = credentialsStore.gmailPassword
      if (!user || !password) {
        return res.status(400).json({ error: 'Gmail credentials not configured. Please enter your email and app password in Settings.' })
      }
      
      console.log(`🌐 Syncing real Gmail inbox for: ${user}`)
      const { ImapFlow } = require('imapflow')
      const { simpleParser } = require('mailparser')
      
      const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user,
          pass: password
        },
        logger: false,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      })
      
      client.on('error', (err: any) => {
        console.error('⚠️ ImapFlow client error:', err)
      })
      
      await client.connect()
      const lock = await client.getMailboxLock('INBOX')
      
      let count = 0
      try {
        const mailbox = client.mailbox
        if (mailbox && mailbox.exists > 0) {
          const startSeq = Math.max(1, mailbox.exists - 49)
          const range = `${startSeq}:${mailbox.exists}`
          
          for await (let msg of client.fetch(range, { source: true })) {
            if (msg && msg.source) {
              const parsed = await simpleParser(msg.source)
              const subject = parsed.subject || '(No Subject)'
              const body = parsed.text || parsed.textAsHtml || ''
              const from = parsed.from?.value?.[0]?.address || 'unknown@example.com'
              const date = parsed.date ? parsed.date.toISOString() : new Date().toISOString()
              
              const isJob = /interview|application|job|hiring|career|recruiting/i.test(subject + ' ' + body)
              const isDelivery = /shipping|delivery|shipped|arriving|order/i.test(subject + ' ' + body)
              
              let source: any = 'gmail'
              let type: any = 'email'
              if (isJob) {
                source = 'job'
                type = 'job_email'
              } else if (isDelivery) {
                source = 'delivery'
                type = 'delivery_email'
              }
              
              await pipeline.ingest({
                source,
                type,
                userId,
                data: {
                  from,
                  subject,
                  body: body.slice(0, 1000),
                  date
                }
              })
              count++
            }
          }
        }
      } finally {
        lock.release()
        await client.logout()
      }
      logAction('SYNC_GMAIL', `Synced ${count} real emails from Gmail.`)
    } 
    
    else if (id === 'calendar') {
      const icalUrl = credentialsStore.calendarUrl
      if (!icalUrl) {
        return res.status(400).json({ error: 'Google Calendar iCal URL not configured. Please save it in Settings.' })
      }
      
      console.log(`🌐 Syncing real Google Calendar from iCal URL: ${icalUrl}`)
      const axios = require('axios')
      const ical = require('node-ical')
      
      const response = await axios.get(icalUrl)
      const parsed = ical.sync.parseICS(response.data)
      
      let count = 0
      for (const k in parsed) {
        const ev = parsed[k]
        if (ev.type === 'VEVENT') {
          const start = ev.start ? new Date(ev.start) : new Date()
          const end = ev.end ? new Date(ev.end) : new Date()
          const duration = Math.round((end.getTime() - start.getTime()) / 60000)
          
          const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
          if (start.getTime() >= oneWeekAgo) {
            await pipeline.ingest({
              source: 'calendar',
              type:   'event',
              userId,
              data: {
                title:           ev.summary || 'Calendar Event',
                description:     ev.description || '',
                date:            start.toISOString(),
                attendees:       [],
                location:        ev.location || '',
                durationMinutes: duration || 60
              }
            })
            count++
            if (count >= 5) break
          }
        }
      }
      logAction('SYNC_CALENDAR', `Synced ${count} real events from Google Calendar.`)
    } 
    
    else if (id === 'github') {
      const username = credentialsStore.githubUsername
      const token = credentialsStore.githubToken
      if (!username || !token) {
        return res.status(400).json({ error: 'GitHub credentials not configured. Please save them in Settings.' })
      }
      
      console.log(`🌐 Syncing real GitHub events for user: ${username}`)
      const axios = require('axios')
      const response = await axios.get(`https://api.github.com/users/${username}/events`, {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'PAC-Personal-AI-Companion'
        }
      })
      const events = response.data.slice(0, 5)
      for (const ev of events) {
        if (ev.type === 'PushEvent') {
          const commitMsg = ev.payload.commits?.[0]?.message || 'Code commit'
          await pipeline.ingest({
            source: 'github',
            type:   'push',
            userId,
            data: {
              type:   'PushEvent',
              repo:   ev.repo.name,
              action: 'pushed',
              title:  commitMsg,
              date:   ev.created_at
            }
          })
        } else if (ev.type === 'PullRequestEvent') {
          await pipeline.ingest({
            source: 'github',
            type:   'pr',
            userId,
            data: {
              type:   'PullRequestEvent',
              repo:   ev.repo.name,
              action: ev.payload.action,
              title:  ev.payload.pull_request?.title || 'Pull Request',
              date:   ev.created_at
            }
          })
        } else if (ev.type === 'CreateEvent') {
          await pipeline.ingest({
            source: 'github',
            type:   'project',
            userId,
            data: {
              type:   'CreateEvent',
              repo:   ev.repo.name,
              action: 'created',
              title:  `Created ${ev.payload.ref_type || 'repository'} in ${ev.repo.name}`,
              date:   ev.created_at
            }
          })
        } else if (ev.type === 'WatchEvent') {
          await pipeline.ingest({
            source: 'github',
            type:   'fact',
            userId,
            data: {
              type:   'WatchEvent',
              repo:   ev.repo.name,
              action: 'starred',
              title:  `Starred repository ${ev.repo.name}`,
              date:   ev.created_at
            }
          })
        }
      }
      logAction('SYNC_GITHUB', `Synced ${events.length} real events from GitHub user ${username}`)

      // Also fetch and ingest user's actual repository catalog list!
      try {
        console.log(`🌐 Fetching repository list for user: ${username}`)
        const reposResponse = await axios.get(`https://api.github.com/users/${username}/repos?per_page=10&sort=updated`, {
          headers: {
            'Authorization': `token ${token}`,
            'User-Agent': 'PAC-Personal-AI-Companion'
          }
        })
        const repos = reposResponse.data || []
        for (const repo of repos) {
          await pipeline.ingest({
            source: 'github',
            type:   'project',
            userId,
            data: {
              type:   'CreateEvent',
              repo:   repo.full_name,
              action: 'created',
              title:  `Repository: ${repo.name} - ${repo.description || 'GitHub Repo'} (Primary Language: ${repo.language || 'Markdown/Text'})`,
              date:   repo.updated_at || new Date().toISOString()
            }
          })
        }
        logAction('SYNC_GITHUB_CATALOG', `Synced ${repos.length} repositories from GitHub catalog for ${username}`)
      } catch (repoErr: any) {
        console.error('Failed to sync repo catalog list:', repoErr.message)
      }
    } 
    
    else if (id === 'whatsapp') {
      console.log(`🌐 Syncing personal WhatsApp messages for user: ${userId}`)
      const waService = WhatsAppService.getInstance()
      const syncResult = await waService.syncChats(userId)

      for (const msg of syncResult.messages) {
        await pipeline.ingest({
          source: 'whatsapp',
          type: 'whatsapp_message',
          userId,
          data: msg
        })
      }

      logAction('SYNC_WHATSAPP', `Synced ${syncResult.syncedCount} WhatsApp chat messages.`)
    }

    else {
      return res.status(400).json({ error: `${id.toUpperCase()} live sync is currently disabled (No fallback mock data allowed).` })
    }

    res.json({ success: true, status })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── CHAT ROUTE (MASTER AGENT) ───────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { query, userId } = req.body
  if (!query || !userId) return res.status(400).json({ error: 'query and userId are required' })

  try {
    const master = new MasterAgent()
    const response = await master.query(query, userId)
    logAction('CHAT_QUERY', `User queried: "${query}"`)
    res.json({ response })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── AUDIT LOGS ROUTE ────────────────────────────────────────

app.get('/api/audit-logs', (req, res) => {
  res.json({ logs: auditLogs })
})

// ─── CREDENTIALS APIS ────────────────────────────────────────

app.get('/api/settings/credentials', (req, res) => {
  res.json({
    githubUsername: credentialsStore.githubUsername,
    githubToken:    credentialsStore.githubToken ? '••••••••••••••••' : '',
    gmailUser:      credentialsStore.gmailUser,
    gmailPassword:  credentialsStore.gmailPassword ? '••••••••••••••••' : '',
    calendarUrl:    credentialsStore.calendarUrl,
    whatsappNumber: credentialsStore.whatsappNumber,
    whatsappApiKey: credentialsStore.whatsappApiKey ? '••••••••••••••••' : '',
    whatsappAutoReply: credentialsStore.whatsappAutoReply,
    whatsappAllowedContacts: credentialsStore.whatsappAllowedContacts,
  })
})

app.post('/api/settings/credentials', (req, res) => {
  const { githubUsername, githubToken, gmailUser, gmailPassword, calendarUrl, whatsappNumber, whatsappApiKey, whatsappAutoReply, whatsappAllowedContacts } = req.body

  if (githubUsername !== undefined) credentialsStore.githubUsername = githubUsername
  if (githubToken !== undefined && githubToken !== '••••••••••••••••') credentialsStore.githubToken = githubToken
  if (gmailUser !== undefined) credentialsStore.gmailUser = gmailUser
  if (gmailPassword !== undefined && gmailPassword !== '••••••••••••••••') credentialsStore.gmailPassword = gmailPassword
  if (calendarUrl !== undefined) credentialsStore.calendarUrl = calendarUrl
  if (whatsappNumber !== undefined) credentialsStore.whatsappNumber = whatsappNumber
  if (whatsappApiKey !== undefined && whatsappApiKey !== '••••••••••••••••') credentialsStore.whatsappApiKey = whatsappApiKey
  if (whatsappAllowedContacts !== undefined) credentialsStore.whatsappAllowedContacts = whatsappAllowedContacts
  if (whatsappAutoReply !== undefined) {
    credentialsStore.whatsappAutoReply = !!whatsappAutoReply
    WhatsAppService.getInstance().setAutoReply(!!whatsappAutoReply)
  }

  saveStoredCredentials()
  logAction('UPDATE_CREDENTIALS', 'Saved new integration keys from app UI Settings.')

  res.json({ success: true })
})

// ─── WHATSAPP APIS ───────────────────────────────────────────

app.get('/api/whatsapp/qr', async (req, res) => {
  try {
    const waService = WhatsAppService.getInstance()
    const data = await waService.getQrCode()
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/whatsapp/status', (req, res) => {
  try {
    const status = WhatsAppService.getInstance().getStatus()
    res.json(status)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/whatsapp/toggle-auto-reply', (req, res) => {
  const { enabled } = req.body
  const waService = WhatsAppService.getInstance()
  waService.setAutoReply(!!enabled)
  credentialsStore.whatsappAutoReply = !!enabled
  saveStoredCredentials()
  logAction('WHATSAPP_AUTO_REPLY', `Toggled WhatsApp auto-reply to ${enabled}`)
  res.json({ success: true, autoReply: !!enabled })
})

app.post('/api/whatsapp/webhook', async (req, res) => {
  const { from, senderName, body, userId } = req.body
  if (!from || !body) return res.status(400).json({ error: 'from and body are required' })

  try {
    const waService = WhatsAppService.getInstance()
    const autoReplyText = await waService.handleIncomingMessage({
      from,
      senderName,
      body,
      date: new Date().toISOString()
    }, userId || 'default-user-id')

    logAction('WHATSAPP_INCOMING', `Processed incoming message from ${senderName || from}`)
    res.json({ success: true, autoReplyText })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── ACTION EXECUTION APIS ───────────────────────────────────

app.post('/api/actions/email/send', async (req, res) => {
  const { to, subject, body } = req.body
  const gmailUser = credentialsStore.gmailUser
  const gmailPassword = credentialsStore.gmailPassword

  if (!gmailUser || !gmailPassword) {
    return res.status(400).json({ error: 'Gmail credentials not configured. Please save them in Settings.' })
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPassword
      }
    })

    await transporter.sendMail({
      from: gmailUser,
      to,
      subject,
      text: body
    })

    logAction('SEND_EMAIL', `Successfully sent email to ${to}`)
    res.json({ success: true })
  } catch (err: any) {
    console.error('Failed to send email:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/actions/github/issue', async (req, res) => {
  const { repo, title, body } = req.body
  const githubToken = credentialsStore.githubToken

  if (!githubToken) {
    return res.status(400).json({ error: 'GitHub credentials not configured. Please save them in Settings.' })
  }

  try {
    const axios = require('axios')
    await axios.post(`https://api.github.com/repos/${repo}/issues`, {
      title,
      body
    }, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'User-Agent': 'PAC-Personal-AI-Companion'
      }
    })

    logAction('CREATE_GITHUB_ISSUE', `Successfully created GitHub issue in ${repo}`)
    res.json({ success: true })
  } catch (err: any) {
    console.error('Failed to create GitHub issue:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/actions/github/pr', async (req, res) => {
  const { repo, title, body, head, base } = req.body
  const githubToken = credentialsStore.githubToken

  if (!githubToken) {
    return res.status(400).json({ error: 'GitHub credentials not configured. Please save them in Settings.' })
  }

  try {
    const axios = require('axios')
    await axios.post(`https://api.github.com/repos/${repo}/pulls`, {
      title,
      body,
      head,
      base: base || 'main'
    }, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'User-Agent': 'PAC-Personal-AI-Companion'
      }
    })

    logAction('CREATE_GITHUB_PR', `Successfully created Pull Request in ${repo}`)
    res.json({ success: true })
  } catch (err: any) {
    console.error('Failed to create Pull Request:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/actions/whatsapp/send', async (req, res) => {
  const { to, message } = req.body
  if (!to || !message) return res.status(400).json({ error: 'to and message are required' })

  try {
    const waService = WhatsAppService.getInstance()
    await waService.sendMessage(to, message)
    logAction('SEND_WHATSAPP', `Sent WhatsApp message to ${to}`)
    res.json({ success: true })
  } catch (err: any) {
    console.error('Failed to send WhatsApp message:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Initialize databases and start server
init().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 PAC API Server running at http://localhost:${PORT}`)
  })
})
