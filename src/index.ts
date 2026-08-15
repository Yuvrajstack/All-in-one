import dotenv from 'dotenv'
dotenv.config()

import * as readline from 'readline'
import { initQdrantCollection } from './db/qdrant'
import { initNeo4j } from './db/neo4j'
import pool from './db/postgres'
import { MasterAgent } from './agents/MasterAgent'
import { IngestionPipeline } from './pipelines/IngestionPipeline'

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

async function main() {
  console.log('🚀 PAC Agent Engine starting...')

  await pool.query('SELECT 1')
  console.log('✅ Postgres connected')

  await initQdrantCollection()
  console.log('✅ Qdrant ready')

  await initNeo4j()
  console.log('✅ Neo4j ready')

  const pipeline = new IngestionPipeline()

  // ingest job email
  await pipeline.ingest({
    source: 'job',
    type:   'job_email',
    userId: TEST_USER_ID,
    data: {
      from:    'recruiting@amazon.com',
      subject: 'Your application for SDE-1 role — Online Assessment',
      body:    'Hi Akansh, congratulations! We would like to move forward with your application for the SDE-1 position. Please complete the online assessment by July 15th at 11:59 PM. The assessment will take approximately 90 minutes.',
      date:    new Date().toISOString()
    }
  })

  // ingest gmail
  await pipeline.ingest({
    source: 'gmail',
    type:   'email',
    userId: TEST_USER_ID,
    data: {
      from:    'hr@google.com',
      subject: 'Interview Invitation — Software Engineer',
      body:    'Hi Akansh, we would like to schedule a technical interview on July 10th at 3PM IST.',
      date:    new Date().toISOString()
    }
  })

  // ingest calendar
  await pipeline.ingest({
    source: 'calendar',
    type:   'event',
    userId: TEST_USER_ID,
    data: {
      title:           'System Design Interview — Google',
      description:     'Technical interview for Software Engineer role',
      date:            '2026-07-10T15:00:00+05:30',
      attendees:       ['akansh@gmail.com', 'hr@google.com'],
      location:        'https://meet.google.com/abc-xyz',
      durationMinutes: 60
    }
  })

  // ingest github
  await pipeline.ingest({
    source: 'github',
    type:   'pr',
    userId: TEST_USER_ID,
    data: {
      type:   'PullRequestEvent',
      repo:   'akansh/pac-agent-engine',
      action: 'merged',
      title:  'feat: memory classification with Neo4j',
      date:   new Date().toISOString()
    }
  })

  // ingest manual fact
  await pipeline.ingest({
    source: 'manual',
    type:   'text',
    userId: TEST_USER_ID,
    data: {
      text: 'I met John from Microsoft today, he is the engineering manager for the Azure team. He mentioned they are hiring for backend roles.',
      date: new Date().toISOString()
    }
  })

  // ingest delivery
  await pipeline.ingest({
    source: 'delivery',
    type:   'delivery_email',
    userId: TEST_USER_ID,
    data: {
      from:    'noreply@amazon.in',
      subject: 'Your order #123-456 has shipped!',
      body:    'Hi Akansh, your order of Mechanical Keyboard (Cherry MX Brown) has been shipped. Expected delivery: July 15th, 2026. Track your order at: amazon.in/track/123-456',
      date:    new Date().toISOString()
    }
  })

  // ingest document
  await pipeline.ingest({
    source: 'document',
    type:   'text',
    userId: TEST_USER_ID,
    data: {
      title:   'resume.txt',
      content: `Akansh Gupta - Software Engineer
      
Experience:
- Built CodeReviewer AI: GitHub webhook integration with BullMQ job queue and Groq API for automated code review
- Built DevLog: Duolingo-style developer learning journal with streak tracking and GitHub contribution heatmaps
- Built BizzBot: AI-powered FAQ chatbot for small businesses using Python/Flask and LLaMA 3.1

Skills:
- Backend: Node.js, Express, TypeScript, Python, Flask
- Databases: PostgreSQL, MongoDB, Redis, Neo4j, Qdrant
- AI/ML: LangChain, Groq API, OpenAI, Vector Embeddings
- DevOps: Docker, Git, Linux

Education:
- B.Tech Computer Science, 3rd year
- CGPA: decent, focused on practical projects

Currently building PAC (Personal AI Companion) - a privacy-first multi-agent AI system`,
      type: 'text'
    }
  })

  console.log('\n✅ All data ingested via pipeline\n')

  // interactive chat
  const master = new MasterAgent()
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout
  })

  console.log('💬 PAC is ready! Ask me anything (type "exit" to quit)\n')

  const ask = () => {
    rl.question('You: ', async (query) => {
      if (query === 'exit') {
        console.log('Goodbye!')
        rl.close()
        process.exit(0)
      }
      const answer = await master.query(query, TEST_USER_ID)
      console.log(`\n🤖 PAC: ${answer}\n`)
      ask()
    })
  }

  ask()
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})