import pg from 'pg'

const { Pool } = pg

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL é obrigatório para iniciar a aplicação.')
  }

  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}
