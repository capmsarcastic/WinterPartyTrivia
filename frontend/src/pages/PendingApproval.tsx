import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { playerApi } from '../lib/api'
import { usePlayer } from '../contexts/PlayerContext'
import { useDeviceId } from '../hooks/useDeviceId'
import { STRINGS } from '../strings'
import type { Team } from '../types'

export default function PendingApproval() {
  const navigate = useNavigate()
  const location = useLocation()
  const deviceId = useDeviceId()
  const { setSession } = usePlayer()

  const team = location.state?.team as Team | undefined
  const creatorName = location.state?.creatorName as string | undefined
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!team) { navigate('/join', { replace: true }); return }

    const ch = supabase
      .channel(`pending-team-${team.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${team.id}` },
        (payload) => {
          const updated = payload.new as Team
          if (updated.status === 'approved') {
            // Send creator to join screen with their team pre-selected so they enter their name + passcode
            navigate('/join', {
              replace: true,
              state: { autoSelectTeamId: updated.id },
            })
          } else if (updated.status === 'deleted') {
            navigate('/join/rejected', {
              replace: true,
              state: { message: updated.rejection_message },
            })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [team?.id])

  async function handleCancel() {
    if (!team) return
    setCancelling(true)
    try {
      await playerApi.cancelTeam(deviceId, team.id)
    } catch { /* ignore */ }
    navigate('/join', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="text-7xl mb-6 animate-pulse-slow">⏳</div>
      <h1 className="font-heading text-2xl font-bold text-ocean-50 mb-2">
        {STRINGS.pending.heading}
      </h1>
      <p className="text-ocean-300 mb-2">
        {STRINGS.pending.subheading}
      </p>
      {team && (
        <p className="text-ocean-400 text-sm mb-8">Team: <span className="text-ocean-200 font-medium">{team.name}</span></p>
      )}

      <div className="w-8 h-1 bg-ocean-400 rounded-full animate-pulse mb-8" />

      <button
        className="btn-ghost text-sm"
        onClick={handleCancel}
        disabled={cancelling}
      >
        {STRINGS.pending.cancelButton}
      </button>
    </div>
  )
}
