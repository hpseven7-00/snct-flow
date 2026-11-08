export type RoomStatus = 'available' | 'occupied' | 'blocked'

export type Room = {
  id: string
  name: string
  local: string
  status: RoomStatus
  presentations: string[]
}

export type User = {
  id: string
  username: string
  role: 'admin' | 'monitor'
}

type ApiErrorPayload = {
  error?: {
    message?: string
  }
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json()) as T & ApiErrorPayload
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.message ?? `A solicitação falhou (${response.status}).`,
    )
  }

  return payload
}

export async function fetchCurrentUser(): Promise<User> {
  const payload = await request<{ user: User }>('/api/auth/me')
  return payload.user
}

export async function login(username: string, password: string): Promise<User> {
  const payload = await request<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return payload.user
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
}

export async function createMonitorAccount(
  username: string,
  password: string,
): Promise<User> {
  const payload = await request<{ user: User }>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return payload.user
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
