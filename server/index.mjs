import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AuthService,
  clearSessionCookie,
  parseCookies,
  SESSION_COOKIE,
  sessionCookie,
} from './auth.mjs'
import { createPool } from './database.mjs'
import { DomainError, setRoomStatus } from './domain.mjs'
import { PostgresRoomStore } from './postgres-store.mjs'

const rootPath = resolve(fileURLToPath(new URL('../', import.meta.url)))
const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? (
  process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'
)
const maxBodyBytes = 16 * 1024
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

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

function setSecurityHeaders(response) {
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('x-frame-options', 'DENY')
  response.setHeader('referrer-policy', 'same-origin')
  response.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    response.setHeader('strict-transport-security', 'max-age=31536000')
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function getSessionToken(request) {
  return parseCookies(request.headers.cookie).get(SESSION_COOKIE)
}

function assertSameOrigin(request) {
  const origin = request.headers.origin
  if (!origin) return

  let originUrl
  try {
    originUrl = new URL(origin)
  } catch {
    throw new DomainError(403, 'INVALID_ORIGIN', 'Origem não autorizada.')
  }

  if (originUrl.host !== request.headers.host || !['http:', 'https:'].includes(originUrl.protocol)) {
    throw new DomainError(403, 'INVALID_ORIGIN', 'Origem não autorizada.')
  }
}

async function requireUser(request, auth) {
  const user = await auth.authenticate(getSessionToken(request))
  if (!user) {
    throw new DomainError(401, 'UNAUTHENTICATED', 'Faça login para continuar.')
  }
  return user
}

function userCanManageAccounts(user) {
  if (user.role !== 'admin') {
    throw new DomainError(403, 'FORBIDDEN', 'Somente o coordenador pode cadastrar monitores.')
  }
}

async function serveStatic(request, response, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    throw new DomainError(404, 'NOT_FOUND', 'Página não encontrada.')
  }

  const distPath = resolve(rootPath, 'dist')
  let relativePath
  try {
    relativePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^[/\\]+/, '')
  } catch {
    throw new DomainError(400, 'INVALID_PATH', 'Caminho inválido.')
  }

  let filePath = resolve(distPath, relativePath)
  if (filePath !== distPath && !filePath.startsWith(`${distPath}${sep}`)) {
    throw new DomainError(404, 'NOT_FOUND', 'Página não encontrada.')
  }

  try {
    await access(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    filePath = resolve(distPath, 'index.html')
  }

  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) {
    filePath = resolve(distPath, 'index.html')
  }
  response.writeHead(200, {
    'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'cache-control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  if (request.method === 'HEAD') {
    response.end()
  } else {
    createReadStream(filePath).pipe(response)
  }
}

export function createApiServer(store, auth, { serveFrontend = false } = {}) {
  return createServer(async (request, response) => {
    setSecurityHeaders(response)
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
      const pathname = url.pathname

      if (pathname.startsWith('/api/')) {
        response.setHeader('cache-control', 'no-store')
      }

      if (request.method === 'GET' && pathname === '/api/health') {
        sendJson(response, 200, { status: 'ok' })
        return
      }

      if (request.method === 'POST' && pathname === '/api/auth/login') {
        assertSameOrigin(request)
        const body = await readJsonBody(request)
        const result = await auth.login(body?.username, body?.password)
        const secure = process.env.NODE_ENV === 'production'
        response.setHeader('set-cookie', sessionCookie(result.token, secure))
        sendJson(response, 200, { user: result.user })
        return
      }

      if (request.method === 'GET' && pathname === '/api/auth/me') {
        sendJson(response, 200, { user: await requireUser(request, auth) })
        return
      }

      if (request.method === 'POST' && pathname === '/api/auth/logout') {
        assertSameOrigin(request)
        await auth.logout(getSessionToken(request))
        response.setHeader('set-cookie', clearSessionCookie(process.env.NODE_ENV === 'production'))
        response.writeHead(204, { 'cache-control': 'no-store' })
        response.end()
        return
      }

      if (request.method === 'POST' && pathname === '/api/users') {
        assertSameOrigin(request)
        const user = await requireUser(request, auth)
        userCanManageAccounts(user)
        const body = await readJsonBody(request)
        const createdUser = await auth.createMonitor(body?.username, body?.password)
        sendJson(response, 201, { user: createdUser })
        return
      }

      if (request.method === 'GET' && pathname === '/api/rooms') {
        await requireUser(request, auth)
        sendJson(response, 200, { rooms: await store.listRooms() })
        return
      }

      const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/status)?$/)
      if (roomMatch) {
        let roomId
        try {
          roomId = decodeURIComponent(roomMatch[1])
        } catch {
          throw new DomainError(400, 'INVALID_ROOM_ID', 'Identificador de sala inválido.')
        }

        const isStatusResource = pathname.endsWith('/status')
        if (request.method === 'GET' && !isStatusResource) {
          await requireUser(request, auth)
          const room = await store.getRoom(roomId)
          if (!room) {
            throw new DomainError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.')
          }
          sendJson(response, 200, { room })
          return
        }

        if (request.method === 'PATCH' && isStatusResource) {
          assertSameOrigin(request)
          await requireUser(request, auth)
          const body = await readJsonBody(request)
          const rooms = await store.update((current) =>
            setRoomStatus(current, roomId, body?.status),
          )
          sendJson(response, 200, { rooms })
          return
        }
      }

      if (pathname.startsWith('/api/')) {
        throw new DomainError(404, 'NOT_FOUND', 'Endpoint não encontrado.')
      }

      if (serveFrontend) {
        await serveStatic(request, response, pathname)
        return
      }

      throw new DomainError(404, 'NOT_FOUND', 'Endpoint não encontrado.')
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

      if (error.code === '23505') {
        sendJson(response, 409, {
          error: { code: 'USERNAME_EXISTS', message: 'Esse nome de usuário já está em uso.' },
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
  const pool = createPool()
  const store = await new PostgresRoomStore(pool).initialize()
  const auth = new AuthService(store)
  const serveFrontend = process.env.NODE_ENV === 'production'
  if (serveFrontend) {
    await access(resolve(rootPath, 'dist/index.html'))
  }

  const server = createApiServer(store, auth, { serveFrontend })
  server.listen(port, host, () => {
    console.log(`SNCT Flow disponível em http://${host}:${port}`)
  })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(async (error) => {
        if (error) {
          console.error('Falha ao encerrar o servidor:', error)
          process.exitCode = 1
        }
        await pool.end()
      })
    })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Não foi possível iniciar a aplicação:', error)
    process.exitCode = 1
  })
}
