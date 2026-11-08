import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  createMonitorAccount,
  fetchCurrentUser,
  fetchRooms,
  login,
  logout,
  updateRoomStatus,
} from './api'
import type { Room, RoomStatus, User } from './api'
import './App.css'

const ROOM_LAYOUT: Record<string, { left: number; top: number; width: number; height: number }> = {
  'sala-a': { left: 4, top: 19, width: 26, height: 15 },
  'sala-b': { left: 4, top: 38, width: 26, height: 15 },
  'sala-c': { left: 34, top: 25, width: 24, height: 15 },
  'sala-d': { left: 34, top: 44, width: 24, height: 15 },
  'sala-e': { left: 76, top: 19, width: 21, height: 15 },
  'sala-f': { left: 76, top: 38, width: 21, height: 15 },
}

const STATUS_DETAILS: Record<RoomStatus, { label: string; color: string; badge: string }> = {
  available: {
    label: 'Disponível',
    color: 'bg-emerald-400',
    badge: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  },
  occupied: {
    label: 'Ocupada',
    color: 'bg-amber-400',
    badge: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  },
  blocked: {
    label: 'Bloqueada',
    color: 'bg-slate-400',
    badge: 'border-slate-400/40 bg-slate-400/10 text-slate-200',
  },
}

function currentTime() {
  return new Date()
}

function getRoomPosition(index: number) {
  const column = index % 3
  const row = Math.floor(index / 3)

  return {
    left: 4 + column * 31,
    top: 19 + row * 19,
    width: 26,
    height: 15,
  }
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [authError, setAuthError] = useState('')
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [syncError, setSyncError] = useState('')
  const [monitorUsername, setMonitorUsername] = useState('')
  const [monitorPassword, setMonitorPassword] = useState('')
  const [monitorMessage, setMonitorMessage] = useState('')
  const [monitorError, setMonitorError] = useState('')
  const [isCreatingMonitor, setIsCreatingMonitor] = useState(false)

  const refreshRooms = async () => {
    const updatedRooms = await fetchRooms()
    setRooms(updatedRooms)
    setLastUpdatedAt(currentTime())
    setSelectedRoomId((current) =>
      updatedRooms.some((room) => room.id === current)
        ? current
        : updatedRooms[0]?.id ?? '',
    )
  }

  const loadRooms = async () => {
    setLoadError('')
    try {
      await refreshRooms()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as salas.')
    }
  }

  useEffect(() => {
    let active = true
    void fetchCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser)
      })
      .catch((error: unknown) => {
        if (active) {
          if (error instanceof ApiError && error.status === 401) {
            setAuthError('')
          } else {
            setAuthError(error instanceof Error ? error.message : 'Não foi possível verificar o acesso.')
          }
        }
      })
      .finally(() => {
        if (active) setAuthResolved(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!user) return

    let active = true
    let timer: number | undefined
    let hasLoadedRooms = false
    const sync = async () => {
      try {
        const loadedRooms = await fetchRooms()
        if (!active) return
        hasLoadedRooms = true
        setRooms(loadedRooms)
        setLoadError('')
        setSyncError('')
        setLastUpdatedAt(currentTime())
        setSelectedRoomId((current) =>
          loadedRooms.some((room) => room.id === current)
            ? current
            : loadedRooms[0]?.id ?? '',
        )
      } catch (error) {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          setUser(null)
        } else {
          const message = error instanceof Error ? error.message : 'Falha ao atualizar as salas.'
          setSyncError(message)
          if (!hasLoadedRooms) setLoadError(message)
        }
      } finally {
        if (active) {
          timer = window.setTimeout(
            () => {
              if (document.visibilityState === 'visible') {
                void sync()
              } else {
                timer = window.setTimeout(() => void sync(), 5000)
              }
            },
            5000,
          )
        }
      }
    }

    void sync()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [user])

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId)

  const summary = useMemo(
    () => ({
      total: rooms.length,
      available: rooms.filter((room) => room.status === 'available').length,
      occupied: rooms.filter((room) => room.status === 'occupied').length,
      blocked: rooms.filter((room) => room.status === 'blocked').length,
    }),
    [rooms],
  )

  const runAction = async (status: RoomStatus) => {
    if (!selectedRoom) return

    setIsSaving(true)
    setActionError('')
    try {
      await updateRoomStatus(selectedRoom.id, status)
      await refreshRooms()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null)
      } else {
        setActionError(error instanceof Error ? error.message : 'Não foi possível atualizar a sala.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoggingIn(true)
    setLoginError('')
    try {
      const loggedInUser = await login(loginUsername, loginPassword)
      setLoginPassword('')
      setRooms([])
      setLoadError('')
      setUser(loggedInUser)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Não foi possível entrar.')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const signOut = async () => {
    try {
      await logout()
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.')
        return
      }
    }
    setUser(null)
    setRooms([])
    setLoadError('')
    setAuthResolved(true)
    setAuthError('')
    setLoginError('')
  }

  const submitMonitor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreatingMonitor(true)
    setMonitorError('')
    setMonitorMessage('')
    try {
      const monitor = await createMonitorAccount(monitorUsername, monitorPassword)
      setMonitorMessage(`Conta criada para ${monitor.username}.`)
      setMonitorUsername('')
      setMonitorPassword('')
    } catch (error) {
      setMonitorError(error instanceof Error ? error.message : 'Não foi possível criar a conta.')
    } finally {
      setIsCreatingMonitor(false)
    }
  }

  if (!authResolved) {
    return <main className="p-8 text-center text-slate-200">Verificando acesso...</main>
  }

  if (authError && !user) {
    return (
      <main className="mx-auto max-w-xl p-8 text-center text-slate-200">
        <p role="alert">{authError}</p>
        <button
          type="button"
          onClick={() => {
            setAuthError('')
            setAuthResolved(false)
            void fetchCurrentUser()
              .then(setUser)
              .catch((error: unknown) => {
                if (!(error instanceof ApiError && error.status === 401)) {
                  setAuthError(error instanceof Error ? error.message : 'Não foi possível verificar o acesso.')
                }
              })
              .finally(() => setAuthResolved(true))
          }}
          className="mt-4 rounded-xl border border-slate-600 px-4 py-2"
        >
          Tentar novamente
        </button>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <form
          onSubmit={(event) => void submitLogin(event)}
          className="w-full max-w-md space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-soft sm:p-8"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-300">SNCT Flow</p>
            <h1 className="mt-2 text-3xl font-extrabold text-white">Acesso dos monitores</h1>
            <p className="mt-2 text-sm text-slate-400">Entre com a conta fornecida pelo coordenador.</p>
          </div>
          <label className="block space-y-2 text-sm font-medium text-slate-200">
            Usuário
            <input
              autoComplete="username"
              required
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-sky-400"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium text-slate-200">
            Senha
            <input
              type="password"
              autoComplete="current-password"
              required
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-sky-400"
            />
          </label>
          {loginError && <p className="text-sm text-red-300" role="alert">{loginError}</p>}
          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full rounded-xl bg-sky-600 px-4 py-3 font-bold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {isLoggingIn ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </main>
    )
  }

  if (user && rooms.length === 0 && !loadError) {
    return <main className="p-8 text-center text-slate-200">Carregando salas...</main>
  }

  if (loadError || !selectedRoom) {
    return (
      <main className="mx-auto max-w-xl p-8 text-center text-slate-200">
        <p role="alert">{loadError || 'Nenhuma sala está cadastrada.'}</p>
        <button
          type="button"
          onClick={() => void loadRooms()}
          className="mt-4 rounded-xl border border-slate-600 px-4 py-2"
        >
          Tentar novamente
        </button>
      </main>
    )
  }

  const status = STATUS_DETAILS[selectedRoom.status]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-soft backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-300">
              SNCT Flow
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">
              Dashboard de ocupação do evento
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              <span className={`h-2 w-2 rounded-full ${syncError ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              {syncError
                ? 'Sem sincronização'
                : `Atualizado às ${lastUpdatedAt?.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }) ?? '--:--'} · sincroniza a cada 5s`}
            </div>
            <span className="text-sm text-slate-300">{user.username}</span>
            <button type="button" onClick={() => void signOut()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
        {authError && <p className="text-sm text-red-300" role="alert">{authError}</p>}
        {syncError && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" role="status">
            Não foi possível atualizar as salas: {syncError}. Tentaremos novamente.
          </p>
        )}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo das salas">
          <SummaryCard label="Total de salas" value={summary.total} detail="mapeadas" color="text-white" />
          <SummaryCard label="Disponíveis" value={summary.available} detail="prontas para receber" color="text-emerald-300" />
          <SummaryCard label="Ocupadas" value={summary.occupied} detail="com visitantes" color="text-amber-300" />
          <SummaryCard label="Bloqueadas" value={summary.blocked} detail="temporariamente fechadas" color="text-slate-300" />
        </section>

        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-soft sm:p-6">
            <div className="mb-5 flex flex-col gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.26em] text-sky-300">
                  Mapa do campus
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-white">Campus SNCT</h2>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300" aria-label="Legenda do mapa">
                {(Object.keys(STATUS_DETAILS) as RoomStatus[]).map((roomStatus) => (
                  <span key={roomStatus} className="inline-flex items-center gap-2">
                    <span className={`h-3 w-5 rounded-full ${STATUS_DETAILS[roomStatus].color}`} />
                    {STATUS_DETAILS[roomStatus].label}
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <div className="campus-map relative min-w-[760px] overflow-hidden" style={{ aspectRatio: '1010 / 980' }}>
                <div className="campus-path" style={{ left: '2.475%', top: '47.959%', width: '2.178%', height: '40.408%' }} />
                <div className="campus-path campus-path-vertical-end" style={{ left: '73.168%', top: '0%', width: '2.178%', height: '51.122%' }} />
                <div className="campus-path campus-path-horizontal" style={{ left: '46.535%', top: '36.837%', width: '52.277%', height: '2.245%' }} />
                <div className="campus-path campus-path-diagonal" style={{ left: '42.775%', top: '22.449%', width: '32.767%', height: '2.245%' }} />

                <MapBlock label="BLOCO 01" left={1.881} top={12.041} />
                <MapBlock label="BLOCO 02" left={33.069} top={21.429} />
                <MapBlock label="BLOCO 03" left={57.525} top={16.939} />
                <MapBlock label="BLOCO 04" left={76.436} top={27.347} />

                {rooms.map((room, index) => {
                  const position = ROOM_LAYOUT[room.id] ?? getRoomPosition(index)
                  const roomStatus = STATUS_DETAILS[room.status]
                  const isSelected = room.id === selectedRoomId
                  return (
                    <button
                      key={room.id}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${room.name}, ${roomStatus.label}, ${room.local}`}
                      onClick={() => {
                        setSelectedRoomId(room.id)
                        setActionError('')
                      }}
                      className={[
                        'map-room absolute flex flex-col justify-between rounded-md border p-2.5 text-left shadow-lg transition sm:p-3',
                        `map-room-${room.status}`,
                        isSelected ? 'z-10 ring-2 ring-white ring-offset-2 ring-offset-slate-950' : '',
                      ].join(' ')}
                      style={{
                        left: `${position.left}%`,
                        top: `${position.top}%`,
                        width: `${position.width}%`,
                        height: `${position.height}%`,
                      }}
                    >
                      <span className="text-sm font-extrabold text-white sm:text-base">{room.name}</span>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/90 sm:text-xs">
                        <span className={`h-2 w-2 rounded-full ${roomStatus.color}`} />
                        {roomStatus.label}
                      </span>
                    </button>
                  )
                })}

                <div className="campus-entry absolute flex items-center justify-center gap-2 rounded-md border px-3 text-xs font-extrabold text-white sm:text-sm">
                  <span aria-hidden="true">⌖</span>
                  Entrada principal
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              Selecione uma sala no mapa para consultar ou atualizar o estado.
            </p>
          </div>

          <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-soft sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">
                  Sala selecionada
                </p>
                <h2 className="mt-1 text-3xl font-extrabold text-white">{selectedRoom.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{selectedRoom.local}</p>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${status.badge}`}>
                <span className={`h-2 w-2 rounded-full ${status.color}`} />
                {status.label}
              </span>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-sm font-semibold text-slate-400">Apresentações</p>
              {selectedRoom.presentations.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {selectedRoom.presentations.map((presentation) => (
                    <li
                      key={presentation}
                      className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100"
                    >
                      {presentation}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-400">Nenhuma apresentação cadastrada.</p>
              )}
            </div>

            {actionError && (
              <p className="mt-4 text-sm text-red-300" role="alert">{actionError}</p>
            )}

            <div className="mt-6 space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Movimentação
              </p>
              <button
                type="button"
                disabled={isSaving || selectedRoom.status !== 'available'}
                onClick={() => void runAction('occupied')}
                className="w-full rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Registrar entrada · marcar ocupada
              </button>
              <button
                type="button"
                disabled={isSaving || selectedRoom.status !== 'occupied'}
                onClick={() => void runAction('available')}
                className="w-full rounded-xl border border-emerald-400/50 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Registrar saída · liberar sala
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void runAction(selectedRoom.status === 'blocked' ? 'available' : 'blocked')}
                className="w-full rounded-xl border border-slate-500/60 bg-slate-700/40 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-slate-700/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {selectedRoom.status === 'blocked' ? 'Desbloquear sala' : 'Bloquear sala'}
              </button>
            </div>

            {user.role === 'admin' && (
              <form onSubmit={(event) => void submitMonitor(event)} className="mt-8 space-y-3 border-t border-slate-800 pt-6">
                <div>
                  <h3 className="font-bold text-white">Cadastrar monitor</h3>
                  <p className="mt-1 text-xs text-slate-400">Crie um usuário e senha para outro membro da equipe.</p>
                </div>
                <label className="block space-y-1 text-sm text-slate-300">
                  Usuário
                  <input
                    required
                    minLength={3}
                    maxLength={40}
                    autoComplete="off"
                    value={monitorUsername}
                    onChange={(event) => setMonitorUsername(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                  />
                </label>
                <label className="block space-y-1 text-sm text-slate-300">
                  Senha inicial (mínimo 12 caracteres)
                  <input
                    required
                    minLength={12}
                    maxLength={200}
                    type="password"
                    autoComplete="new-password"
                    value={monitorPassword}
                    onChange={(event) => setMonitorPassword(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                  />
                </label>
                {monitorError && <p className="text-sm text-red-300" role="alert">{monitorError}</p>}
                {monitorMessage && <p className="text-sm text-emerald-300" role="status">{monitorMessage}</p>}
                <button
                  type="submit"
                  disabled={isCreatingMonitor}
                  className="w-full rounded-xl border border-sky-400/50 bg-sky-400/10 px-4 py-3 text-sm font-bold text-sky-100 hover:bg-sky-400/20 disabled:opacity-50"
                >
                  {isCreatingMonitor ? 'Criando conta...' : 'Criar conta de monitor'}
                </button>
              </form>
            )}
          </aside>
        </section>
      </main>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  color,
}: {
  label: string
  value: number
  detail: string
  color: string
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-soft">
      <p className="text-sm font-semibold text-slate-400">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className={`text-4xl font-extrabold tabular-nums ${color}`}>{value}</span>
        <span className="text-right text-xs text-slate-400">{detail}</span>
      </div>
    </article>
  )
}

function MapBlock({ label, left, top }: { label: string; left: number; top: number }) {
  return (
    <span
      className="absolute text-[10px] font-extrabold tracking-[0.12em] text-slate-400 sm:text-xs"
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      {label}
    </span>
  )
}

export default App
