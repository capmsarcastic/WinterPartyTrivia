import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../contexts/PlayerContext'
import { publicApi } from '../lib/api'
import { STRINGS } from '../strings'

type NameStatus = 'idle' | 'checking' | 'available' | 'taken'

export const PLAYER_NAME_KEY = 'wpt_display_name'

export function getStoredPlayerName(): string {
  try { return localStorage.getItem(PLAYER_NAME_KEY) ?? '' } catch { return '' }
}

export default function Splash() {
  const navigate = useNavigate()
  const { player, team } = usePlayer()

  const [name, setName] = useState(() => getStoredPlayerName())
  const [nameStatus, setNameStatus] = useState<NameStatus>('idle')
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-restore session on load
  useEffect(() => {
    if (player && team) {
      navigate(`/team/${team.id}`, { replace: true })
    }
  }, [])

  // Name availability check via backend (service role — not blocked by RLS)
  useEffect(() => {
    if (!name.trim()) { setNameStatus('idle'); return }
    if (checkTimer.current) clearTimeout(checkTimer.current)
    setNameStatus('checking')
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await publicApi.checkName(name.trim())
        setNameStatus(res.available ? 'available' : 'taken')
      } catch {
        setNameStatus('idle')
      }
    }, 400)
    return () => { if (checkTimer.current) clearTimeout(checkTimer.current) }
  }, [name])

  function handleGo() {
    if (!name.trim() || nameStatus === 'taken' || nameStatus === 'checking') return
    try { localStorage.setItem(PLAYER_NAME_KEY, name.trim()) } catch {}
    navigate('/join')
  }

  const canGo = name.trim().length > 0 && nameStatus !== 'taken' && nameStatus !== 'checking'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="text-9xl mb-6 animate-pulse-slow select-none">🐋</div>

      <h1 className="font-heading text-4xl font-black text-ocean-50 mb-2">
        {STRINGS.splash.heading}
      </h1>
      <p className="text-ocean-300 text-lg mb-8 max-w-xs">
        {STRINGS.splash.subheading}
      </p>

      <div className="w-full max-w-xs mb-6 text-left">
        <label className="label">{STRINGS.playerName.label}</label>
        <input
          className="input text-center text-lg"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={STRINGS.playerName.placeholder}
          maxLength={30}
          autoFocus
          onKeyDown={e => e.key === 'Enter' && handleGo()}
        />
        <p className={`text-xs mt-1 text-center min-h-[1rem] ${
          nameStatus === 'taken' ? 'text-red-400' :
          nameStatus === 'available' ? 'text-green-400' :
          'text-ocean-500'
        }`}>
          {nameStatus === 'checking' ? STRINGS.playerName.checking :
           nameStatus === 'taken' ? STRINGS.playerName.taken :
           nameStatus === 'available' ? STRINGS.playerName.available :
           ''}
        </p>
      </div>

      <button
        className="btn-primary btn-lg w-full max-w-xs"
        onClick={handleGo}
        disabled={!canGo}
      >
        {STRINGS.splash.cta}
      </button>

      <p className="mt-8 text-ocean-600 text-xs">
        Admin?{' '}
        <button
          className="text-ocean-400 hover:text-ocean-300 underline"
          onClick={() => navigate('/admin')}
        >
          Sign in here
        </button>
      </p>
    </div>
  )
}
