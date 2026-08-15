import pool from './db/postgres'
import { IngestionPipeline } from './pipelines/IngestionPipeline'
import { MasterAgent } from './agents/MasterAgent'

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

async function runTest() {
  console.log('🧪 Starting PAC Integration pipeline test...')

  // Step 1: Create user in DB
  const userRes = await pool.query(
    'INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3) RETURNING *',
    [TEST_USER_ID, 'akansh@gmail.com', 'Akansh']
  )
  console.log('✅ Created user:', userRes.rows[0].email)

  // Step 2: Instantiate pipeline
  const pipeline = new IngestionPipeline()

  // Ingest Amazon job email
  console.log('\n📥 Ingesting Amazon SDE-1 OA email...')
  await pipeline.ingest({
    source: 'job',
    type:   'job_email',
    userId: TEST_USER_ID,
    data: {
      from:    'recruiting@amazon.com',
      subject: 'Your application for SDE-1 role — Online Assessment',
      body:    'Hi Akansh, congratulations! Please complete the online assessment by July 15th at 11:59 PM. The assessment will take approximately 90 minutes.',
      date:    new Date().toISOString()
    }
  })

  // Ingest Google interview invitation email
  console.log('\n📥 Ingesting Google Interview invitation email...')
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

  // Ingest GitHub event
  console.log('\n📥 Ingesting GitHub PR merge event...')
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

  // Step 3: Run Master Agent Queries
  const master = new MasterAgent()

  console.log('\n----------------------------------------')
  console.log('💬 Query 1: "What should I know today?"')
  const answer1 = await master.query('What should I know today?', TEST_USER_ID)
  console.log('🤖 PAC Answer 1:\n', answer1)

  console.log('\n----------------------------------------')
  console.log('💬 Query 2: "Did I receive any interview invitations?"')
  const answer2 = await master.query('Did I receive any interview invitations?', TEST_USER_ID)
  console.log('🤖 PAC Answer 2:\n', answer2)

  console.log('\n----------------------------------------')
  console.log('💬 Query 3: "What tasks are pending?"')
  const answer3 = await master.query('What tasks are pending?', TEST_USER_ID)
  console.log('🤖 PAC Answer 3:\n', answer3)

  console.log('\n----------------------------------------')
  console.log('🎉 ALL PIPELINE INTEGRATION TESTS COMPLETED SUCCESSFULLY!')
}

runTest().catch(err => {
  console.error('❌ Integration test failed:', err)
  process.exit(1)
})
