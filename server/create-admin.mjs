import { AuthService } from './auth.mjs'
import { createPool } from './database.mjs'
import { PostgresRoomStore } from './postgres-store.mjs'

async function main() {
  const username = process.env.SNCT_ADMIN_USERNAME
  const password = process.env.SNCT_ADMIN_PASSWORD
  if (!username || !password) {
    throw new Error('Defina SNCT_ADMIN_USERNAME e SNCT_ADMIN_PASSWORD no ambiente.')
  }

  const pool = createPool()
  try {
    const store = await new PostgresRoomStore(pool).initialize()
    const admin = await new AuthService(store).createFirstAdmin(username, password)
    console.log(`Coordenador inicial criado: ${admin.username}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Não foi possível criar o coordenador inicial:', error.message)
  process.exitCode = 1
})
