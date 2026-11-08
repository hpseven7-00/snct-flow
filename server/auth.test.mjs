import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AuthService,
  hashPassword,
  hashSessionToken,
  normalizeUsername,
  parseCookies,
  validateCredentials,
  verifyPassword,
} from './auth.mjs'
import { DomainError } from './domain.mjs'

function createStore(passwordHash) {
  const sessions = new Map()
  let failures = 0
  const user = {
    id: 'user-id',
    username: 'monitor',
    password_hash: passwordHash,
    role: 'monitor',
  }
  return {
    sessions,
    async getUserByUsername(username) {
      return username === user.username ? user : undefined
    },
    async getLoginFailures() {
      return failures
    },
    async recordLoginFailure() {
      failures += 1
    },
    async clearLoginFailures() {
      failures = 0
    },
    async createSession(tokenHash, userId, expiresAt) {
      sessions.set(tokenHash, { userId, expiresAt })
    },
    async getUserBySession(tokenHash) {
      return sessions.has(tokenHash)
        ? { id: user.id, username: user.username, role: user.role }
        : undefined
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash)
    },
  }
}

test('armazena senha com scrypt e compara sem guardar a senha original', async () => {
  const password = 'senha-segura-123'
  const passwordHash = await hashPassword(password)
  assert.notEqual(passwordHash, password)
  assert.match(passwordHash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
  assert.equal(await verifyPassword(password, passwordHash), true)
  assert.equal(await verifyPassword('outra-senha', passwordHash), false)
})

test('valida formato de conta e requisitos mínimos de senha', () => {
  assert.equal(normalizeUsername('  Monitor_01 '), 'monitor_01')
  assert.throws(() => validateCredentials('ab', 'senha-segura-123'), {
    code: 'INVALID_USERNAME',
  })
  assert.throws(() => validateCredentials('monitor', 'curta'), {
    code: 'INVALID_PASSWORD',
  })
})

test('cria sessão opaca e revogável após autenticação', async () => {
  const store = createStore(await hashPassword('senha-forte'))
  const auth = new AuthService(store)
  const result = await auth.login(' Monitor ', 'senha-forte')
  const tokenHash = hashSessionToken(result.token)

  assert.equal(result.user.username, 'monitor')
  assert.notEqual(tokenHash, result.token)
  assert.equal(store.sessions.has(tokenHash), true)
  assert.equal((await auth.authenticate(result.token)).id, 'user-id')

  await auth.logout(result.token)
  assert.equal(await auth.authenticate(result.token), null)
})

test('retorna erro genérico e limita tentativas inválidas', async () => {
  const store = createStore(await hashPassword('senha-forte'))
  const auth = new AuthService(store)
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await assert.rejects(auth.login('monitor', 'senha-errada'), {
      code: 'INVALID_CREDENTIALS',
    })
  }
  await assert.rejects(
    auth.login('monitor', 'senha-forte'),
    (error) => error instanceof DomainError &&
      error.status === 429 &&
      error.code === 'LOGIN_RATE_LIMITED',
  )
})

test('analisa cookies sem confiar em conteúdo arbitrário', () => {
  const cookies = parseCookies('other=value; snct_session=token-value')
  assert.equal(cookies.get('snct_session'), 'token-value')
  assert.equal(cookies.get('missing'), undefined)
})
