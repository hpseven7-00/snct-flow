import { randomUUID } from 'node:crypto'

export const GROUP_WEIGHTS = Object.freeze({
  Pequeno: 5,
  'Médio': 10,
  Grande: 25,
  'Muito grande': 40,
})

export class DomainError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function findRoom(rooms, roomId) {
  const room = rooms.find((item) => item.id === roomId)
  if (!room) {
    throw new DomainError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.')
  }
  return room
}

export function addGroup(rooms, roomId, size) {
  if (!Object.hasOwn(GROUP_WEIGHTS, size)) {
    throw new DomainError(400, 'INVALID_GROUP_SIZE', 'Tamanho de grupo inválido.')
  }

  const room = findRoom(rooms, roomId)
  if (room.unavailable) {
    throw new DomainError(409, 'ROOM_UNAVAILABLE', 'A sala está indisponível.')
  }

  const group = {
    id: randomUUID(),
    size,
    enteredAt: new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }

  return rooms.map((item) =>
    item.id === roomId ? { ...item, groups: [...item.groups, group] } : item,
  )
}

export function removeLastGroup(rooms, roomId) {
  const room = findRoom(rooms, roomId)
  if (room.groups.length === 0) {
    throw new DomainError(409, 'NO_GROUPS_TO_REMOVE', 'Não há grupos registrados nesta sala.')
  }

  return rooms.map((item) =>
    item.id === roomId
      ? { ...item, groups: item.groups.slice(0, -1) }
      : item,
  )
}

export function setRoomAvailability(rooms, roomId, unavailable) {
  if (typeof unavailable !== 'boolean') {
    throw new DomainError(400, 'INVALID_AVAILABILITY', 'Informe indisponível como valor booleano.')
  }

  findRoom(rooms, roomId)
  return rooms.map((item) =>
    item.id === roomId ? { ...item, unavailable } : item,
  )
}
