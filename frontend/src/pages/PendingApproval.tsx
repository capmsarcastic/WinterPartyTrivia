import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { playerApi, publicApi } from '../lib/api'
import { usePlayer } from '../contexts/PlayerContext'
import { useDeviceId } from '../hooks/useDeviceId'
import { STRINGS } from '../strings'
import { getStoredPlayerName } from './Splash'
import type { Team } from '../types'

export default function PendingApproval() {
  const navigate = useNavigate()
  const location = useLocation()
  const deviceId = useDeviceId()
  const { setSession } = usePlayer()

  const team = location.state?.team as Team | undefined
  const passcode = location.state?.passcode as string | undefined
  const [cancelling, setCancelling] = useState(false)
  const [autoJoining, setAutoJoining] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Prevent double-handling if both poll and realtime fire simultaneously
  const handledRef = useRef(false)

  async function handleTeamUpdate(status: string, rejectionMessage: string | null) {
    if (handledRef.current) return
    if (status === 'approved') {
      handledRef.current = true
      const storedName = getStoredPlayerName()
      if (storedName && passcode && team) {
        setAutoJoining(true)
        try {
          const res = await playerApi.joinTeam(deviceId, team.id, storedName, passcode) as { player: import('../types').Player; team: Team }
          setSession(res.player, res.team)
          navigate(`/team/${team.id}`, { replace: true })
        } catch {
          navigate('/join', { replace: true, state: { message: 'Your team was approved! Join now.' } })
        } finally {
          setAutoJoining(false)
        }
      } else {
        navigate('/join', { replace: true, state: { message: 'Your team was approved! Join now.' } })
      }
    } else if (status === 'deleted' || status === 'not_found') {
      handledRef.current = true
      const msg = rejectionMessage || 'Your team was not approved.'
      navigate('/join', { replace: true, state: { message: msg } })
    }
  }

  useEffect(() => {
    if (!team) { navigate('/join', { replace: true }); return }

    // Poll every 3 seconds — reliable regardless of realtime RLS behaviour
    pollRef.current = setInterval(async () => {
      try {
        const res = await publicApi.teamStatus(team.id)
        await handleTeamUpdate(res.status, res.rejection_message)
      } catch { /* ignore */ }
    }, 3000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
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
      <div className="text-7xl mb-6 animate-pulse-slow">
        {autoJoining ? '🎉' : '⏳'}
      </div>
      <h1 className="font-heading text-2xl font-bold text-ocean-50 mb-2">
        {autoJoining ? 'Joining your team...' : STRINGS.pending.heading}
      </h1>
      <p className="text-ocean-300 mb-2">
        {autoJoining ? "You'll be taken straight in." : STRINGS.pending.subheading}
      </p>
      {team && !autoJoining && (
        <p className="text-ocean-400 text-sm mb-8">Team: <span className="text-ocean-200 font-medium">{team.name}</span></p>
      )}

      {!autoJoining && (
        <>
          <div className="w-8 h-1 bg-ocean-400 rounded-full animate-pulse mb-8" />

          <button
            className="btn-ghost text-sm"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {STRINGS.pending.cancelButton}
          </button>
        </>
      )}
    </div>
  )
}
