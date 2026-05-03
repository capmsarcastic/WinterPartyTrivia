import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../contexts/PlayerContext'
import { useDeviceId } from '../hooks/useDeviceId'
import { playerApi } from '../lib/api'
import { STRINGS } from '../strings'

export default function Splash() {
  const navigate = useNavigate()
  const { player, team } = usePlayer()
  const deviceId = useDeviceId()

  // Auto-restore session on load
  useEffect(() => {
    if (player && team) {
      navigate(`/team/${team.id}`, { replace: true })
      return
    }
    // Check server for existing session
    playerApi.session(deviceId).then(res => {
      if (res.player) {
        // They have an active player — navigate to lobby
        // (PlayerContext will be loaded from localStorage already)
      }
    }).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      {/* Animated whale */}
      <div className="text-9xl mb-6 animate-pulse-slow select-none">🐋</div>

      <h1 className="font-heading text-4xl font-900 text-ocean-50 mb-2">
        {STRINGS.splash.heading}
      </h1>
      <p className="text-ocean-300 text-lg mb-12 max-w-xs">
        {STRINGS.splash.subheading}
      </p>

      <button
        className="btn-primary btn-lg w-full max-w-xs"
        onClick={() => navigate('/join')}
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
