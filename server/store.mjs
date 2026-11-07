import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOM_STATUSES } from './domain.mjs'

const seedPath = fileURLToPath(new URL('./seed-data.json', import.meta.url))
const defaultDataPath = fileURLToPath(new URL('../.data/rooms.json', import.meta.url))

function validateRooms(rooms) {
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new Error('O arquivo de dados deve conter uma lista de salas não vazia.')
  }

  const ids = new Set()
  for (const room of rooms) {
    if (
      !room ||
      typeof room.id !== 'string' ||
      !room.id ||
      ids.has(room.id) ||
      typeof room.name !== 'string' ||
      typeof room.local !== 'string' ||
      !ROOM_STATUSES.includes(room.status) ||
      !Array.isArray(room.presentations)
    ) {
      throw new Error('O arquivo de dados contém uma sala inválida.')
    }

    ids.add(room.id)
  }
}

function migrateRooms(rooms) {
  if (!Array.isArray(rooms)) return rooms

  return rooms.map((room) => {
    if (room.status) return room

    return {
      id: room.id,
      name: room.name,
      local: room.local,
      status: room.unavailable
        ? 'blocked'
        : room.groups?.length
          ? 'occupied'
          : 'available',
      presentations: room.presentations,
    }
  })
}

export class RoomStore {
  #rooms
  #dataPath
  #pendingWrite = Promise.resolve()

  constructor(dataPath = defaultDataPath) {
    this.#dataPath = resolve(dataPath)
  }

  async initialize() {
    let needsMigration = false
    try {
      const savedRooms = JSON.parse(await readFile(this.#dataPath, 'utf8'))
      needsMigration = Array.isArray(savedRooms) && savedRooms.some((room) => !room.status)
      this.#rooms = migrateRooms(savedRooms)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Não foi possível carregar os dados de salas: ${error.message}`, {
          cause: error,
        })
      }

      this.#rooms = migrateRooms(JSON.parse(await readFile(seedPath, 'utf8')))
      await this.#persist(this.#rooms)
    }

    validateRooms(this.#rooms)
    if (needsMigration) {
      await this.#persist(this.#rooms)
    }
    return this
  }

  listRooms() {
    return structuredClone(this.#rooms)
  }

  async update(transform) {
    const operation = this.#pendingWrite.then(async () => {
      const nextRooms = transform(this.#rooms)
      validateRooms(nextRooms)
      await this.#persist(nextRooms)
      this.#rooms = nextRooms
      return this.listRooms()
    })

    this.#pendingWrite = operation.catch(() => {})
    return operation
  }

  async #persist(rooms) {
    await mkdir(dirname(this.#dataPath), { recursive: true })
    const temporaryPath = `${this.#dataPath}.${process.pid}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(rooms, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.#dataPath)
  }
}
