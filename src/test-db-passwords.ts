import { Pool } from 'pg'

async function tryConnect(password: string) {
  const p = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: password,
    database: 'postgres'
  })
  try {
    await p.query('SELECT 1')
    await p.end()
    return true
  } catch (err) {
    await p.end()
    return false
  }
}

async function run() {
  const passwords = [
    'admin', 'root', 'postgres', 'password', '1234', '123456', '12345', '123',
    'postgres123', 'yuvraj', 'yuvraj123', 'kabadwal', 'kabadwal123', 'pac', 'pac123',
    'admin123', 'root123', 'password123'
  ]
  console.log('Testing passwords for user "postgres"...')
  for (const pw of passwords) {
    const success = await tryConnect(pw)
    if (success) {
      console.log(`🎉 SUCCESS! Password for user "postgres" is: "${pw}"`)
      return
    }
  }
  console.log('❌ All default passwords failed.')
}

run()
