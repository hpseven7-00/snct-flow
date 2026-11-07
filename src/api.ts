export type RoomStatus = 'available' | 'occupied' | 'blocked'

export type Room = {
  id: string
  name: string
  local: string
  status: RoomStatus
  presentations: string[]
}

type ApiErrorPayload = {
  error?: {
    message?: string
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  const payload = (await response.json()) as T & ApiErrorPayload
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `A solicitação falhou (${response.status}).`)
  }

  return payload
}

export async function fetchRooms(): Promise<Room[]> {
  const payload = await request<{ rooms: Room[] }>('/api/rooms')
  return payload.rooms
}

export async function updateRoomStatus(
  roomId: string,
  status: RoomStatus,
): Promise<void> {
  await request(`/api/rooms/${encodeURIComponent(roomId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}
