import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { DomainError, setRoomStatus } from './domain.mjs'
import { migrateLegacyRooms } from './postgres-store.mjs'

const rooms = JSON.parse(
  await readFile(new URL('./seed-data.json', import.meta.url), 'utf8'),
)

test('registra entrada e saída como mudanças simples de status', () => {
  const occupied = setRoomStatus(rooms, 'sala-a', 'occupied')
  assert.equal(occupied[0].status, 'occupied')

  const available = setRoomStatus(occupied, 'sala-a', 'available')
  assert.equal(available[0].status, 'available')
})

test('permite bloquear uma sala e reabri-la como disponível', () => {
  const occupied = setRoomStatus(rooms, 'sala-a', 'occupied')
  const blocked = setRoomStatus(occupied, 'sala-a', 'blocked')
  assert.equal(blocked[0].status, 'blocked')

  const reopened = setRoomStatus(blocked, 'sala-a', 'available')
  assert.equal(reopened[0].status, 'available')
})

test('rejeita estados inválidos e entrada em sala bloqueada', () => {
  assert.throws(() => setRoomStatus(rooms, 'sala-a', 'full'), {
    code: 'INVALID_STATUS',
  })
  assert.throws(
    () => setRoomStatus(rooms, 'sala-e', 'occupied'),
    { code: 'INVALID_STATUS_TRANSITION' },
  )
})

test('retorna 404 para sala inexistente e trata status repetido como idempotente', () => {
  assert.equal(setRoomStatus(rooms, 'sala-a', 'available'), rooms)
  assert.throws(
    () => setRoomStatus(rooms, 'inexistente', 'occupied'),
    (error) => error instanceof DomainError && error.status === 404,
  )
})

test('migra os dados locais antigos para os três estados', () => {
  const migrated = migrateLegacyRooms([
    {
      id: 'livre',
      name: 'Sala livre',
      local: 'Bloco 01',
      unavailable: false,
      groups: [],
      presentations: [],
    },
    {
      id: 'ocupada',
      name: 'Sala ocupada',
      local: 'Bloco 01',
      unavailable: false,
      groups: [{ size: 'Pequeno' }],
      presentations: [],
    },
    {
      id: 'bloqueada',
      name: 'Sala bloqueada',
      local: 'Bloco 01',
      unavailable: true,
      groups: [],
      presentations: [],
    },
  ])
  assert.deepEqual(migrated.map((room) => room.status), [
    'available',
    'occupied',
    'blocked',
  ])
  assert.equal('groups' in migrated[1], false)
})
