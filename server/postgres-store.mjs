import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOM_STATUSES } from './domain.mjs'

const rootPath = resolve(fileURLToPath(new URL('../', import.meta.url)))
const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))
const seedPath = fileURLToPath(new URL('./seed-data.json', import.meta.url))

export function migrateLegacyRooms(rooms) {
  if (!Array.isArray(rooms)) {
    throw new Error('Os dados iniciais devem conter uma lista de salas.')
  }

  return rooms.map((room) => ({
    id: room.id,
    name: room.name,
    local: room.local,
    status: room.status ?? (
      room.unavailable
        ? 'blocked'
        : room.groups?.length
          ? 'occupied'
          : 'available'
    ),
    presentations: room.presentations,
  }))
}

function validateRooms(rooms) {
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new Error('O banco deve conter pelo menos uma sala inicial.')
  }

  const ids = new Set()
  for (const room of rooms) {
    if (
      !room ||
      typeof room.id !== 'string' ||
      !room.id ||
      ids.has(room.id) ||
      typeof room.name !== 'string' ||
      typeof room.local !== 'string' ||
      !ROOM_STATUSES.includes(room.status) ||
      !Array.isArray(room.presentations) ||
      room.presentations.some((item) => typeof item !== 'string')
    ) {
      throw new Error('Os dados iniciais contêm uma sala inválida.')
    }
    ids.add(room.id)
  }
}

async function loadInitialRooms() {
  const legacyPath = process.env.SNCT_LEGACY_DATA_FILE ?? resolve(rootPath, '.data/rooms.json')
  try {
    const savedRooms = JSON.parse(await readFile(legacyPath, 'utf8'))
    const rooms = migrateLegacyRooms(savedRooms)
    validateRooms(rooms)
    return rooms
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Não foi possível importar os dados locais antigos: ${error.message}`, {
        cause: error,
      })
    }
  }

  const seed = JSON.parse(await readFile(seedPath, 'utf8'))
  validateRooms(seed)
  return seed
}

export class PostgresRoomStore {
  #pool

  constructor(pool) {
    this.#pool = pool
  }

  get pool() {
    return this.#pool
  }

  async initialize() {
    const schema = await readFile(schemaPath, 'utf8')
    await this.#pool.query(schema)

    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [728154201])
      const { rows } = await client.query('SELECT count(*)::int AS count FROM rooms')
      if (rows[0].count === 0) {
        const rooms = await loadInitialRooms()
        for (const room of rooms) {
          await client.query(
            `INSERT INTO rooms (id, name, local, status, presentations)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [room.id, room.name, room.local, room.status, JSON.stringify(room.presentations)],
          )
        }
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    return this
  }

  async listRooms() {
    const { rows } = await this.#pool.query(
      'SELECT id, name, local, status, presentations FROM rooms ORDER BY id',
    )
    return rows
  }

  async getRoom(roomId) {
    const { rows } = await this.#pool.query(
      'SELECT id, name, local, status, presentations FROM rooms WHERE id = $1',
      [roomId],
    )
    return rows[0]
  }

  async update(transform) {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        'SELECT id, name, local, status, presentations FROM rooms ORDER BY id FOR UPDATE',
      )
      const nextRooms = transform(rows)
      validateRooms(nextRooms)
      for (const room of nextRooms) {
        await client.query(
          'UPDATE rooms SET status = $2, updated_at = now() WHERE id = $1',
          [room.id, room.status],
        )
      }
      await client.query('COMMIT')
      return nextRooms
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async createUser(username, passwordHash, role = 'monitor') {
    const id = randomUUID()
    const { rows } = await this.#pool.query(
      `INSERT INTO users (id, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role`,
      [id, username, passwordHash, role],
    )
    return rows[0]
  }

  async getUserByUsername(username) {
    const { rows } = await this.#pool.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [username],
    )
    return rows[0]
  }

  async getUserById(id) {
    const { rows } = await this.#pool.query(
      'SELECT id, username, role FROM users WHERE id = $1',
      [id],
    )
    return rows[0]
  }

  async countAdmins() {
    const { rows } = await this.#pool.query(
      "SELECT count(*)::int AS count FROM users WHERE role = 'admin'",
    )
    return rows[0].count
  }

  async createSession(tokenHash, userId, expiresAt) {
    await this.#pool.query('DELETE FROM sessions WHERE expires_at <= now()')
    await this.#pool.query(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [tokenHash, userId, expiresAt],
    )
  }

  async getUserBySession(tokenHash) {
    const { rows } = await this.#pool.query(
      `SELECT users.id, users.username, users.role
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
      [tokenHash],
    )
    return rows[0]
  }

  async deleteSession(tokenHash) {
    await this.#pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])
  }

  async getLoginFailures(username) {
    const { rows } = await this.#pool.query(
      `SELECT failed_count, window_started_at
       FROM login_attempts
       WHERE username = $1 AND window_started_at > now() - interval '15 minutes'`,
      [username],
    )
    return rows[0]?.failed_count ?? 0
  }

  async recordLoginFailure(username) {
    await this.#pool.query(
      `DELETE FROM login_attempts
       WHERE window_started_at <= now() - interval '1 day'`,
    )
    await this.#pool.query(
      `INSERT INTO login_attempts (username, failed_count, window_started_at)
       VALUES ($1, 1, now())
       ON CONFLICT (username) DO UPDATE SET
         failed_count = CASE
           WHEN login_attempts.window_started_at <= now() - interval '15 minutes' THEN 1
           ELSE login_attempts.failed_count + 1
         END,
         window_started_at = CASE
           WHEN login_attempts.window_started_at <= now() - interval '15 minutes' THEN now()
           ELSE login_attempts.window_started_at
         END`,
      [username],
    )
  }

  async clearLoginFailures(username) {
    await this.#pool.query('DELETE FROM login_attempts WHERE username = $1', [username])
  }
}
