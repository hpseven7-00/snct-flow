import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DomainError, setRoomStatus } from './domain.mjs'
import { RoomStore } from './store.mjs'

const rootPath = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1'
const maxBodyBytes = 16 * 1024

async function readJsonBody(request) {
  const chunks = []
  let bytes = 0

  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > maxBodyBytes) {
      throw new DomainError(413, 'PAYLOAD_TOO_LARGE', 'O corpo da requisição excede o limite permitido.')
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new DomainError(400, 'INVALID_JSON', 'O corpo da requisição deve ser um JSON válido.')
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

export function createApiServer(store) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
      const pathname = url.pathname

      if (request.method === 'GET' && pathname === '/api/health') {
        sendJson(response, 200, { status: 'ok' })
        return
      }

      if (request.method === 'GET' && pathname === '/api/rooms') {
        sendJson(response, 200, { rooms: store.listRooms() })
        return
      }

      const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/status)?$/)
      if (!roomMatch) {
        throw new DomainError(404, 'NOT_FOUND', 'Endpoint não encontrado.')
      }

      let roomId
      try {
        roomId = decodeURIComponent(roomMatch[1])
      } catch {
        throw new DomainError(400, 'INVALID_ROOM_ID', 'Identificador de sala inválido.')
      }
      const isStatusResource = pathname.endsWith('/status')

      if (request.method === 'GET' && !isStatusResource) {
        const room = store.listRooms().find((item) => item.id === roomId)
        if (!room) {
          throw new DomainError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.')
        }
        sendJson(response, 200, { room })
        return
      }

      if (request.method === 'PATCH' && isStatusResource) {
        const body = await readJsonBody(request)
        const rooms = await store.update((current) =>
          setRoomStatus(current, roomId, body?.status),
        )
        sendJson(response, 200, { rooms })
        return
      }

      sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } })
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error)
        return
      }

      if (error instanceof DomainError) {
        sendJson(response, error.status, {
          error: { code: error.code, message: error.message },
        })
        return
      }

      console.error('Falha ao processar requisição da API:', error)
      sendJson(response, 500, {
        error: { code: 'INTERNAL_ERROR', message: 'Erro interno ao processar a requisição.' },
      })
    }
  })
}

async function main() {
  const store = await new RoomStore(
    process.env.SNCT_DATA_FILE ?? resolve(rootPath, '.data/rooms.json'),
  ).initialize()
  const server = createApiServer(store)

  server.listen(port, host, () => {
    console.log(`SNCT Flow API disponível em http://${host}:${port}`)
  })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close((error) => {
        if (error) {
          console.error('Falha ao encerrar a API:', error)
          process.exitCode = 1
        }
      })
    })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Não foi possível iniciar a API:', error)
    process.exitCode = 1
  })
}
