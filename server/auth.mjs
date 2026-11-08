import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { DomainError } from './domain.mjs'

const scrypt = promisify(scryptCallback)
export const SESSION_COOKIE = 'snct_session'
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000
const DUMMY_PASSWORD_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`

export function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : ''
}

export function validateCredentials(username, password) {
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    throw new DomainError(
      400,
      'INVALID_USERNAME',
      'O usuário deve ter de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.',
    )
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new DomainError(400, 'INVALID_PASSWORD', 'A senha deve ter entre 12 e 200 caracteres.')
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derivedKey = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password, encodedHash) {
  const [algorithm, saltHex, hashHex] = encodedHash?.split('$') ?? []
  if (
    algorithm !== 'scrypt' ||
    !/^[a-f0-9]{32}$/.test(saltHex ?? '') ||
    !/^[a-f0-9]{128}$/.test(hashHex ?? '')
  ) {
    await scrypt(password, Buffer.from(DUMMY_PASSWORD_HASH.split('$')[1], 'hex'), 64)
    return false
  }

  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(expected, actual)
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function parseCookies(header = '') {
  const cookies = new Map()
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    cookies.set(name, value)
  }
  return cookies
}

export function sessionCookie(token, secure) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure) {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`
}

export class AuthService {
  #store

  constructor(store) {
    this.#store = store
  }

  async login(usernameInput, password) {
    const username = normalizeUsername(usernameInput)
    if (await this.#store.getLoginFailures(username) >= 10) {
      throw new DomainError(
        429,
        'LOGIN_RATE_LIMITED',
        'Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.',
      )
    }

    const user = await this.#store.getUserByUsername(username)
    const passwordHash = user?.password_hash ?? DUMMY_PASSWORD_HASH
    const validPassword = await verifyPassword(
      typeof password === 'string' ? password : '',
      passwordHash,
    )

    if (!user || !validPassword) {
      await this.#store.recordLoginFailure(username)
      throw new DomainError(401, 'INVALID_CREDENTIALS', 'Usuário ou senha incorretos.')
    }

    await this.#store.clearLoginFailures(username)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    await this.#store.createSession(hashSessionToken(token), user.id, expiresAt)
    return { token, user: publicUser(user) }
  }

  async authenticate(token) {
    if (!token || token.length > 128) return null
    return (await this.#store.getUserBySession(hashSessionToken(token))) ?? null
  }

  async logout(token) {
    if (token && token.length <= 128) {
      await this.#store.deleteSession(hashSessionToken(token))
    }
  }

  async createMonitor(usernameInput, password) {
    const username = normalizeUsername(usernameInput)
    validateCredentials(username, password)

    try {
      return publicUser(await this.#store.createUser(username, await hashPassword(password)))
    } catch (error) {
      if (error.code === '23505') {
        throw new DomainError(409, 'USERNAME_EXISTS', 'Esse nome de usuário já está em uso.')
      }
      throw error
    }
  }

  async createFirstAdmin(usernameInput, password) {
    const username = normalizeUsername(usernameInput)
    validateCredentials(username, password)

    const client = await this.#store.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [728154202])
      const { rows } = await client.query(
        "SELECT count(*)::int AS count FROM users WHERE role = 'admin'",
      )
      if (rows[0].count > 0) {
        throw new Error('Já existe um coordenador. O bootstrap inicial não pode ser repetido.')
      }
      const id = randomUUID()
      await client.query(
        `INSERT INTO users (id, username, password_hash, role)
         VALUES ($1, $2, $3, 'admin')`,
        [id, username, await hashPassword(password)],
      )
      await client.query('COMMIT')
      return { id, username, role: 'admin' }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role }
}
