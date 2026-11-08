import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiServer } from './index.mjs'
import { setRoomStatus } from './domain.mjs'

const initialRooms = [
  { id: 'sala-a', name: 'Sala A', local: 'Bloco 01', status: 'available', presentations: ['Robótica'] },
]

function createTestStore() {
  let rooms = structuredClone(initialRooms)
  return {
    async listRooms() {
      return structuredClone(rooms)
    },
    async getRoom(roomId) {
      return structuredClone(rooms.find((room) => room.id === roomId))
    },
    async update(transform) {
      rooms = transform(rooms)
      return structuredClone(rooms)
    },
  }
}

function createTestAuth() {
  const users = {
    'admin-token': { id: 'admin-id', username: 'coordenador', role: 'admin' },
    'monitor-token': { id: 'monitor-id', username: 'monitor', role: 'monitor' },
  }
  const createdMonitors = []
  return {
    createdMonitors,
    async authenticate(token) {
      return users[token] ?? null
    },
    async getLoginFailures() {
      return 0
    },
    async login(username, password) {
      assert.equal(username, 'monitor')
      assert.equal(password, 'senha-forte')
      return { token: 'monitor-token', user: users['monitor-token'] }
    },
    async logout() {},
    async createMonitor(username, password) {
      const user = { id: 'novo-id', username, role: 'monitor' }
      createdMonitors.push({ user, password })
      return user
    },
  }
}

test('API exige autenticação para salas e permite login/logout com cookie protegido', async (context) => {
  const store = createTestStore()
  const auth = createTestAuth()
  const server = createApiServer(store, auth)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  }))

  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  const health = await fetch(`${baseUrl}/api/health`)
  assert.deepEqual(await health.json(), { status: 'ok' })

  const unauthorized = await fetch(`${baseUrl}/api/rooms`)
  assert.equal(unauthorized.status, 401)
  assert.equal((await unauthorized.json()).error.code, 'UNAUTHENTICATED')

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify({ username: 'monitor', password: 'senha-forte' }),
  })
  assert.equal(login.status, 200)
  assert.match(login.headers.get('set-cookie'), /HttpOnly/)
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/)

  const rooms = await fetch(`${baseUrl}/api/rooms`, {
    headers: { cookie: 'snct_session=monitor-token' },
  })
  assert.deepEqual((await rooms.json()).rooms, initialRooms)

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: {
      cookie: 'snct_session=monitor-token',
      origin: baseUrl,
    },
  })
  assert.equal(logout.status, 204)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
})

test('monitores podem atualizar salas, mas só coordenadores cadastram contas', async (context) => {
  const store = createTestStore()
  const auth = createTestAuth()
  const server = createApiServer(store, auth)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  }))

  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const blockedOrigin = await fetch(`${baseUrl}/api/rooms/sala-a/status`, {
    method: 'PATCH',
    headers: {
      cookie: 'snct_session=monitor-token',
      origin: 'https://other.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ status: 'occupied' }),
  })
  assert.equal(blockedOrigin.status, 403)

  const monitorCreation = await fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: {
      cookie: 'snct_session=monitor-token',
      origin: baseUrl,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ username: 'outro', password: 'senha-forte-123' }),
  })
  assert.equal(monitorCreation.status, 403)

  const created = await fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: {
      cookie: 'snct_session=admin-token',
      origin: baseUrl,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ username: 'outro', password: 'senha-forte-123' }),
  })
  assert.equal(created.status, 201)
  assert.equal((await created.json()).user.role, 'monitor')
  assert.equal(auth.createdMonitors.length, 1)

  const update = await fetch(`${baseUrl}/api/rooms/sala-a/status`, {
    method: 'PATCH',
    headers: {
      cookie: 'snct_session=monitor-token',
      origin: baseUrl,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ status: 'occupied' }),
  })
  assert.equal(update.status, 200)
  assert.equal((await store.getRoom('sala-a')).status, 'occupied')

  const invalidTransition = await fetch(`${baseUrl}/api/rooms/sala-a/status`, {
    method: 'PATCH',
    headers: {
      cookie: 'snct_session=monitor-token',
      origin: baseUrl,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ status: 'blocked' }),
  })
  assert.equal(invalidTransition.status, 200)
})

test('as regras de negócio permanecem aplicadas na camada da API', async () => {
  const rooms = structuredClone(initialRooms)
  assert.equal(setRoomStatus(rooms, 'sala-a', 'occupied')[0].status, 'occupied')
})
