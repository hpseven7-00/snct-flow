export type GroupSize = 'Pequeno' | 'Médio' | 'Grande' | 'Muito grande'

export type GroupEntry = {
  id: string
  size: GroupSize
  enteredAt: string
}

export type Room = {
  id: string
  name: string
  local: string
  capacity: number
  unavailable: boolean
  groups: GroupEntry[]
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

export async function createGroup(roomId: string, size: GroupSize): Promise<void> {
  await request(`/api/rooms/${encodeURIComponent(roomId)}/groups`, {
    method: 'POST',
    body: JSON.stringify({ size }),
  })
}

export async function removeLastGroup(roomId: string): Promise<void> {
  await request(`/api/rooms/${encodeURIComponent(roomId)}/groups`, {
    method: 'DELETE',
  })
}

export async function updateRoomAvailability(
  roomId: string,
  unavailable: boolean,
): Promise<void> {
  await request(`/api/rooms/${encodeURIComponent(roomId)}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ unavailable }),
  })
}
