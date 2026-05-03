import { createContext, useContext, useState, useCallback } from 'react'
import type { Player, Team } from '../types'

interface PlayerContextValue {
  player: Player | null
  team: Team | null
  setSession: (player: Player, team: Team) => void
  clearSession: () => void
  updateTeam: (team: Team) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

const PLAYER_KEY = 'wpt_player'
const TEAM_KEY = 'wpt_team'

function loadStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(() => loadStored<Player>(PLAYER_KEY))
  const [team, setTeam] = useState<Team | null>(() => loadStored<Team>(TEAM_KEY))

  const setSession = useCallback((p: Player, t: Team) => {
    setPlayer(p)
    setTeam(t)
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify(p))
      localStorage.setItem(TEAM_KEY, JSON.stringify(t))
    } catch { /* ignore */ }
  }, [])

  const clearSession = useCallback(() => {
    setPlayer(null)
    setTeam(null)
    try {
      localStorage.removeItem(PLAYER_KEY)
      localStorage.removeItem(TEAM_KEY)
    } catch { /* ignore */ }
  }, [])

  const updateTeam = useCallback((t: Team) => {
    setTeam(t)
    try {
      localStorage.setItem(TEAM_KEY, JSON.stringify(t))
    } catch { /* ignore */ }
  }, [])

  return (
    <PlayerContext.Provider value={{ player, team, setSession, clearSession, updateTeam }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
