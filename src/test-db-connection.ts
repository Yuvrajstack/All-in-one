import { Pool } from 'pg'

async function tryConnect(user: string, password?: string, database?: string) {
  const p = new Pool({
    host: 'localhost',
    port: 5432,
    user,
    password,
    database: database || 'postgres'
  })
  try {
    const res = await p.query('SELECT NOW()')
    console.log(`✅ Success: user=${user} password=${password ? '***' : '(none)'} database=${database || 'postgres'}`)
    await p.end()
    return { success: true, poolConfig: { user, password, database } }
  } catch (err: any) {
    console.log(`❌ Failed: user=${user} password=${password ? '***' : '(none)'} database=${database || 'postgres'} - Error: ${err.message}`)
    await p.end()
    return { success: false }
  }
}

async function testAll() {
  console.log('Probing connection options...')
  const credentials = [
    { user: 'postgres', password: '' },
    { user: 'postgres', password: 'password' },
    { user: 'postgres', password: 'postgres' },
    { user: 'pac_user', password: 'password' }
  ]

  for (const cred of credentials) {
    const res = await tryConnect(cred.user, cred.password)
    if (res.success) {
      console.log('Checking if pac_db exists and attempting to connect...')
      // try to connect to pac_db
      const pacRes = await tryConnect(cred.user, cred.password, 'pac_db')
      if (!pacRes.success) {
        console.log('Database pac_db does not exist. Attempting to create it...')
        const adminPool = new Pool({
          host: 'localhost',
          port: 5432,
          user: cred.user,
          password: cred.password,
          database: 'postgres'
        })
        try {
          await adminPool.query('CREATE DATABASE pac_db')
          console.log('✅ Created pac_db successfully!')
          await tryConnect(cred.user, cred.password, 'pac_db')
        } catch (dbErr: any) {
          console.error('Failed to create pac_db:', dbErr.message)
        } finally {
          await adminPool.end()
        }
      }
      break
    }
  }
}

testAll()
