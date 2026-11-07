import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { addGroup, DomainError, removeLastGroup, setRoomAvailability } from './domain.mjs'

const seedRooms = JSON.parse(await readFile(new URL('./seed-data.json', import.meta.url), 'utf8'))
const rooms = structuredClone(seedRooms)

test('registra grupos válidos em salas disponíveis', () => {
  const updated = addGroup(rooms, 'sala-a', 'Pequeno')
  assert.equal(updated[0].groups.length, rooms[0].groups.length + 1)
  assert.equal(updated[0].groups.at(-1).size, 'Pequeno')
  assert.notEqual(updated[0].groups.at(-1).id, '')
})

test('rejeita tamanho inválido e sala indisponível', () => {
  assert.throws(() => addGroup(rooms, 'sala-a', 'Gigante'), {
    code: 'INVALID_GROUP_SIZE',
  })
  assert.throws(() => addGroup(rooms, 'sala-e', 'Pequeno'), {
    code: 'ROOM_UNAVAILABLE',
  })
})

test('remove o último grupo e rejeita saída sem grupos', () => {
  const updated = removeLastGroup(rooms, 'sala-a')
  assert.equal(updated[0].groups.length, rooms[0].groups.length - 1)
  assert.throws(() => removeLastGroup(rooms, 'sala-e'), {
    code: 'NO_GROUPS_TO_REMOVE',
  })
})

test('altera disponibilidade somente com valor booleano e sala existente', () => {
  assert.equal(setRoomAvailability(rooms, 'sala-a', true)[0].unavailable, true)
  assert.throws(() => setRoomAvailability(rooms, 'sala-a', 'true'), {
    code: 'INVALID_AVAILABILITY',
  })
  assert.throws(() => setRoomAvailability(rooms, 'inexistente', false), {
    code: 'ROOM_NOT_FOUND',
  })
})

test('erros de regra de negócio carregam status HTTP e código estáveis', () => {
  assert.throws(
    () => addGroup(rooms, 'inexistente', 'Pequeno'),
    (error) => error instanceof DomainError && error.status === 404,
  )
})
