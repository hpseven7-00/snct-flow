import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createApiServer } from './index.mjs'
import { RoomStore } from './store.mjs'

const seedRooms = JSON.parse(
  await readFile(new URL('./seed-data.json', import.meta.url), 'utf8'),
)

test('API atualiza e persiste status e responde com erros consistentes', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'snct-flow-'))
  context.after(() => rm(directory, { recursive: true, force: true }))

  const store = await new RoomStore(join(directory, 'rooms.json')).initialize()
  const server = createApiServer(store)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  }))

  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  const health = await fetch(`${baseUrl}/api/health`)
  assert.deepEqual(await health.json(), { status: 'ok' })

  const initial = await fetch(`${baseUrl}/api/rooms`)
  assert.deepEqual((await initial.json()).rooms, seedRooms)

  const occupied = await fetch(`${baseUrl}/api/rooms/sala-a/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'occupied' }),
  })
  assert.equal(occupied.status, 200)
  assert.equal(
    (await occupied.json()).rooms.find((room) => room.id === 'sala-a').status,
    'occupied',
  )

  const blocked = await fetch(`${baseUrl}/api/rooms/sala-a/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'blocked' }),
  })
  assert.equal(
    (await blocked.json()).rooms.find((room) => room.id === 'sala-a').status,
    'blocked',
  )

  const persistedStore = await new RoomStore(join(directory, 'rooms.json')).initialize()
  assert.equal(persistedStore.listRooms()[0].status, 'blocked')

  const invalidTransition = await fetch(`${baseUrl}/api/rooms/sala-a/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'occupied' }),
  })
  assert.equal(invalidTransition.status, 409)
  assert.equal(
    (await invalidTransition.json()).error.code,
    'INVALID_STATUS_TRANSITION',
  )

  const invalid = await fetch(`${baseUrl}/api/rooms/sala-a/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'full' }),
  })
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'INVALID_STATUS')

  const malformed = await fetch(`${baseUrl}/api/rooms/sala-a/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
  assert.equal(malformed.status, 400)
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON')
})

test('migra dados antigos de grupos e disponibilidade para status', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'snct-flow-'))
  context.after(() => rm(directory, { recursive: true, force: true }))

  const dataPath = join(directory, 'rooms.json')
  await writeFile(dataPath, JSON.stringify([
    {
      id: 'legacy-available',
      name: 'Sala antiga livre',
      local: 'Bloco 01',
      capacity: 40,
      unavailable: false,
      groups: [],
      presentations: [],
    },
    {
      id: 'legacy-occupied',
      name: 'Sala antiga ocupada',
      local: 'Bloco 01',
      capacity: 40,
      unavailable: false,
      groups: [{ id: 'g1', size: 'Pequeno', enteredAt: '08:00' }],
      presentations: [],
    },
    {
      id: 'legacy-blocked',
      name: 'Sala antiga bloqueada',
      local: 'Bloco 01',
      capacity: 40,
      unavailable: true,
      groups: [],
      presentations: [],
    },
  ]))

  const store = await new RoomStore(dataPath).initialize()
  assert.deepEqual(store.listRooms().map((room) => room.status), [
    'available',
    'occupied',
    'blocked',
  ])
  assert.equal('groups' in store.listRooms()[1], false)
  const persisted = JSON.parse(await readFile(dataPath, 'utf8'))
  assert.deepEqual(persisted.map((room) => room.status), [
    'available',
    'occupied',
    'blocked',
  ])
  assert.equal('groups' in persisted[1], false)
  assert.equal('unavailable' in persisted[2], false)
})
