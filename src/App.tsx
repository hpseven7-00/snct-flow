import { useMemo, useState } from 'react'

type GroupSize = 'Pequeno' | 'Médio' | 'Grande' | 'Muito grande'

type GroupEntry = {
  id: string
  size: GroupSize
  enteredAt: string
}

type Room = {
  id: string
  name: string
  local: string
  capacity: number
  unavailable: boolean
  groups: GroupEntry[]
  presentations: string[]
}

const GROUP_WEIGHTS: Record<GroupSize, number> = {
  Pequeno: 5,
  Médio: 10,
  Grande: 25,
  'Muito grande': 40,
}

const INITIAL_ROOMS: Room[] = [
  {
    id: 'sala-a',
    name: 'Sala A',
    local: 'Bloco 01',
    capacity: 40,
    unavailable: false,
    groups: [
      { id: 'g1', size: 'Pequeno', enteredAt: '08:10' },
      { id: 'g2', size: 'Médio', enteredAt: '08:35' },
    ],
    presentations: ['Robótica', 'Química aplicada'],
  },
  {
    id: 'sala-b',
    name: 'Sala B',
    local: 'Bloco 01',
    capacity: 60,
    unavailable: false,
    groups: [{ id: 'g3', size: 'Grande', enteredAt: '08:20' }],
    presentations: ['Biologia', 'Saúde'],
  },
  {
    id: 'sala-c',
    name: 'Sala C',
    local: 'Bloco 02',
    capacity: 50,
    unavailable: false,
    groups: [
      { id: 'g4', size: 'Pequeno', enteredAt: '08:15' },
      { id: 'g5', size: 'Médio', enteredAt: '08:50' },
      { id: 'g6', size: 'Médio', enteredAt: '09:00' },
    ],
    presentations: ['Tecnologia', 'Engenharia'],
  },
  {
    id: 'sala-d',
    name: 'Sala D',
    local: 'Bloco 02',
    capacity: 30,
    unavailable: false,
    groups: [{ id: 'g7', size: 'Muito grande', enteredAt: '08:45' }],
    presentations: ['Astronomia'],
  },
  {
    id: 'sala-e',
    name: 'Sala E',
    local: 'Bloco 03',
    capacity: 45,
    unavailable: true,
    groups: [],
    presentations: ['Sustentabilidade'],
  },
  {
    id: 'sala-f',
    name: 'Sala F',
    local: 'Bloco 03',
    capacity: 55,
    unavailable: false,
    groups: [{ id: 'g8', size: 'Pequeno', enteredAt: '08:30' }],
    presentations: ['Matemática', 'Geografia'],
  },
]

const GROUP_ORDER: GroupSize[] = ['Pequeno', 'Médio', 'Grande', 'Muito grande']

function calculateOccupancy(room: Room) {
  const totalWeight = room.groups.reduce(
    (sum, group) => sum + GROUP_WEIGHTS[group.size],
    0,
  )

  return (totalWeight / room.capacity) * 100
}

function getStatus(room: Room) {
  if (room.unavailable) {
    return {
      label: 'Indisponível',
      badge: 'border-slate-500/70 bg-slate-500/15 text-slate-200',
      fill: 'bg-slate-500',
    }
  }

  const occupancy = calculateOccupancy(room)

  if (occupancy < 25) {
    return {
      label: 'Disponível',
      badge: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200',
      fill: 'bg-emerald-500',
    }
  }

  if (occupancy < 50) {
    return {
      label: 'Pouco ocupado',
      badge: 'border-yellow-400/60 bg-yellow-500/15 text-yellow-200',
      fill: 'bg-yellow-500',
    }
  }

  if (occupancy < 75) {
    return {
      label: 'Ocupação média',
      badge: 'border-orange-400/60 bg-orange-500/15 text-orange-200',
      fill: 'bg-orange-500',
    }
  }

  return {
    label: 'Alta ocupação',
    badge: 'border-red-400/60 bg-red-500/15 text-red-200',
    fill: 'bg-red-500',
  }
}

function createGroupId() {
  return `grupo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function App() {
  const [rooms, setRooms] = useState(INITIAL_ROOMS)
  const [selectedRoomId, setSelectedRoomId] = useState(INITIAL_ROOMS[0].id)

  const selectedRoom =
    rooms.find((room) => room.id === selectedRoomId) ?? rooms[0]

  const summary = useMemo(() => {
    const total = rooms.length
    const available = rooms.filter((room) => !room.unavailable).length
    const occupied = rooms.filter((room) => {
      const status = getStatus(room)
      return !room.unavailable && status.label !== 'Disponível'
    }).length

    return {
      total,
      available,
      occupied,
    }
  }, [rooms])

  const addGroup = (size: GroupSize) => {
    setRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.id === selectedRoomId
          ? {
              ...room,
              groups: [
                ...room.groups,
                {
                  id: createGroupId(),
                  size,
                  enteredAt: new Date().toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                },
              ],
            }
          : room,
      ),
    )
  }

  const removeGroup = () => {
    setRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.id === selectedRoomId && room.groups.length > 0
          ? {
              ...room,
              groups: room.groups.slice(0, -1),
            }
          : room,
      ),
    )
  }

  const toggleAvailability = () => {
    setRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.id === selectedRoomId
          ? { ...room, unavailable: !room.unavailable }
          : room,
      ),
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-soft backdrop-blur sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">
                SNCT Flow
              </p>
              <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
                Dashboard de ocupação do evento
              </h1>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              Atualizado às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-soft">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Total de salas
            </p>
            <div className="mt-3 flex items-end justify-between gap-2">
              <span className="text-3xl font-bold text-white">{summary.total}</span>
              <span className="text-sm text-slate-300">mapeadas</span>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-soft">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Disponíveis
            </p>
            <div className="mt-3 flex items-end justify-between gap-2">
              <span className="text-3xl font-bold text-emerald-300">{summary.available}</span>
              <span className="text-sm text-slate-300">em uso</span>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-soft">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Ocupação ativa
            </p>
            <div className="mt-3 flex items-end justify-between gap-2">
              <span className="text-3xl font-bold text-amber-300">{summary.occupied}</span>
              <span className="text-sm text-slate-300">salas monitoradas</span>
            </div>
          </article>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.8fr_1fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-soft sm:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-sky-300">
                  Mapa das salas
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">Campus SNCT</h2>
              </div>
              <div className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">
                Atualização em tempo real
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rooms.map((room) => {
                const status = getStatus(room)
                const occupancy = calculateOccupancy(room)
                const isSelected = room.id === selectedRoomId

                return (
                  <button
                    key={room.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedRoomId(room.id)}
                    className={[
                      'rounded-2xl border p-4 text-left shadow-soft transition-all duration-200',
                      isSelected
                        ? 'border-sky-400/70 bg-sky-500/10 ring-2 ring-sky-400/40'
                        : 'border-slate-700 bg-slate-950/60 hover:border-slate-500',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-semibold text-white">{room.name}</span>
                      <span
                        className={[
                          'inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]',
                          status.badge,
                        ].join(' ')}
                      >
                        {status.label}
                      </span>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-2">
                      <span className="text-3xl font-bold text-white">
                        {Math.round(occupancy)}%
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                        ocupação
                      </span>
                    </div>

                    <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={['h-full rounded-full', status.fill].join(' ')}
                        style={{ width: `${Math.min(occupancy, 100)}%` }}
                      />
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
                      <span>{room.groups.length} grupos</span>
                      <span>{room.local}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-sky-300">
                  Sala selecionada
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">{selectedRoom.name}</h2>
              </div>
              <button
                type="button"
                onClick={toggleAvailability}
                className={[
                  'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]',
                  selectedRoom.unavailable
                    ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                    : 'border-slate-600 bg-slate-800 text-slate-200',
                ].join(' ')}
              >
                {selectedRoom.unavailable ? 'Disponibilizar' : 'Indisponibilizar'}
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-300">Status</span>
                <span
                  className={[
                    'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]',
                    getStatus(selectedRoom).badge,
                  ].join(' ')}
                >
                  {getStatus(selectedRoom).label}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400">Capacidade</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {selectedRoom.capacity} pessoas
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Ocupação</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {Math.round(calculateOccupancy(selectedRoom))}%
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Grupos presentes
              </p>

              {selectedRoom.groups.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                  Nenhum grupo registrado nesta sala.
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {selectedRoom.groups.map((group) => (
                    <li
                      key={group.id}
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-white">{group.size}</p>
                        <p className="text-xs text-slate-400">Entrada {group.enteredAt}</p>
                      </div>
                      <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
                        {GROUP_WEIGHTS[group.size]} pts
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Registrar movimentação
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {GROUP_ORDER.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => addGroup(size)}
                    className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-medium text-slate-100 hover:border-sky-400/60 hover:bg-sky-500/10"
                  >
                    {size}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={removeGroup}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-amber-400/60 hover:bg-amber-500/10"
                >
                  Registrar saída
                </button>
                <button
                  type="button"
                  onClick={toggleAvailability}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-red-400/60 hover:bg-red-500/10"
                >
                  {selectedRoom.unavailable ? 'Liberar' : 'Bloquear'}
                </button>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Apresentações
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedRoom.presentations.map((presentation) => (
                  <span
                    key={presentation}
                    className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-100"
                  >
                    {presentation}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

export default App
