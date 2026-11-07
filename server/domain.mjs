export const ROOM_STATUSES = Object.freeze(['available', 'occupied', 'blocked'])

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

export function setRoomStatus(rooms, roomId, status) {
  if (!ROOM_STATUSES.includes(status)) {
    throw new DomainError(400, 'INVALID_STATUS', 'Status de sala inválido.')
  }

  const room = findRoom(rooms, roomId)
  const allowedTransitions = {
    available: ['occupied', 'blocked'],
    occupied: ['available', 'blocked'],
    blocked: ['available'],
  }

  if (room.status === status) {
    return rooms
  }

  if (!allowedTransitions[room.status]?.includes(status)) {
    throw new DomainError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Não é possível alterar uma sala ${room.status} para ${status}.`,
    )
  }

  return rooms.map((item) =>
    item.id === roomId ? { ...item, status } : item,
  )
}
