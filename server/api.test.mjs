import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createApiServer } from './index.mjs'
import { RoomStore } from './store.mjs'

const seedRooms = JSON.parse(await readFile(new URL('./seed-data.json', import.meta.url), 'utf8'))

test('API valida operações, persiste alterações e informa erros em JSON', async (context) => {
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
  assert.equal((await initial.json()).rooms.length, seedRooms.length)

  const added = await fetch(`${baseUrl}/api/rooms/sala-a/groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ size: 'Pequeno' }),
  })
  assert.equal(added.status, 201)
  const addedRooms = (await added.json()).rooms
  assert.equal(addedRooms[0].groups.length, seedRooms[0].groups.length + 1)

  const concurrentEntries = await Promise.all([
    fetch(`${baseUrl}/api/rooms/sala-b/groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size: 'Pequeno' }),
    }),
    fetch(`${baseUrl}/api/rooms/sala-b/groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size: 'Médio' }),
    }),
  ])
  assert.deepEqual(concurrentEntries.map((response) => response.status), [201, 201])
  assert.equal(
    store.listRooms().find((room) => room.id === 'sala-b').groups.length,
    seedRooms[1].groups.length + 2,
  )

  const availability = await fetch(`${baseUrl}/api/rooms/sala-a/availability`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ unavailable: true }),
  })
  assert.equal((await availability.json()).rooms[0].unavailable, true)

  const persistedStore = await new RoomStore(join(directory, 'rooms.json')).initialize()
  assert.equal(persistedStore.listRooms()[0].unavailable, true)

  const invalid = await fetch(`${baseUrl}/api/rooms/sala-a/groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ size: 'Gigante' }),
  })
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'INVALID_GROUP_SIZE')

  const malformed = await fetch(`${baseUrl}/api/rooms/sala-a/groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
  assert.equal(malformed.status, 400)
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON')
})
