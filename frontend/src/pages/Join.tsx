import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { playerApi, publicApi } from '../lib/api'
import { usePlayer } from '../contexts/PlayerContext'
import { useDeviceId } from '../hooks/useDeviceId'
import { useToast } from '../contexts/ToastContext'
import { TeamEmoji } from '../components/ImagePicker'
import { STRINGS } from '../strings'
import { getStoredPlayerName } from './Splash'
import type { Team } from '../types'

type PageMessage = {
  variant: 'info' | 'error'
  title: string
  body?: string
}

type JoinLocationState = {
  message?: string
  pageMessage?: PageMessage
}

interface JoinFormProps {
  team: Team
  onClose: () => void
}

function JoinForm({ team, onClose }: JoinFormProps) {
  const navigate = useNavigate()
  const deviceId = useDeviceId()
  const { setSession } = usePlayer()
  const { showToast } = useToast()
  const [passcode, setPasscode] = useState('')
  const [loading, setLoading] = useState(false)

  const storedName = getStoredPlayerName()

  async function handleJoin() {
    if (!storedName || passcode.length !== 4) return
    setLoading(true)
    try {
      const res = await playerApi.joinTeam(deviceId, team.id, storedName, passcode) as { player: import('../types').Player; team: Team }
      setSession(res.player, res.team)
      navigate(`/team/${team.id}`)
    } catch (err: unknown) {
      showToast((err as Error).message || STRINGS.errors.generic, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-30 p-4">
      <div className="card w-full max-w-md animate-slide-up">
        <div className="flex items-center gap-3 mb-5">
          <TeamEmoji imageId={team.image_id} size="md" />
          <div>
            <h2 className="font-heading text-xl font-bold text-ocean-50">{team.name}</h2>
            <p className="text-ocean-300 text-sm">{STRINGS.join.memberCount(team.member_count ?? 0)}</p>
          </div>
          <button onClick={onClose} className="ml-auto btn-ghost btn-sm">✕</button>
        </div>

        <div className="space-y-4">
          <div className="bg-ocean-700/50 rounded-lg px-4 py-3 text-sm text-ocean-200">
            Joining as <span className="font-medium text-ocean-50">{storedName || '(no name set)'}</span>
            {' · '}
            <button
              className="text-ocean-400 underline"
              onClick={() => { onClose(); navigate('/') }}
            >
              {STRINGS.playerName.changeLink}
            </button>
          </div>

          <div>
            <label className="label">{STRINGS.teamCreator.passcodeLabel}</label>
            <input
              className="input tracking-widest text-center text-2xl"
              value={passcode}
              onChange={e => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
            />
          </div>
          <button
            className="btn-primary w-full"
            disabled={!storedName || passcode.length !== 4 || loading}
            onClick={handleJoin}
          >
            {loading ? STRINGS.join.joiningButton : STRINGS.join.joinButton}
          </button>
          {!storedName && (
            <p className="text-xs text-red-400 text-center">
              {STRINGS.join.missingNameWarning}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Join() {
  const navigate = useNavigate()
  const location = useLocation()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [teamCreationEnabled, setTeamCreationEnabled] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  // Persistent notification — sticks until replaced or navigated away
  const [pageMessage, setPageMessage] = useState<string | PageMessage | null>(
    () => {
      const state = location.state as JoinLocationState | null
      return state?.pageMessage ?? state?.message ?? null
    }
  )

  async function loadData() {
    try {
      const [cfg, ts] = await Promise.all([publicApi.eventConfig(), publicApi.teams()])
      setTeamCreationEnabled(cfg.team_creation_enabled)
      setTeams((ts as Team[]).filter((t: Team) => t.status === 'approved'))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    const ch = supabase
      .channel('join-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => loadData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'event_config' }, () => loadData())
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  const approvedTeams = teams.filter(t => t.status === 'approved')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-safe-top pt-6 pb-4">
        <button onClick={() => navigate('/')} className="text-ocean-400 text-sm mb-3">← Let's Go screen</button>
        <h1 className="font-heading text-2xl font-bold text-ocean-50">{STRINGS.join.heading}</h1>
      </header>

      <div className="flex-1 px-5 pb-6 overflow-y-auto">
        {/* Persistent page notification */}
        {pageMessage && (
          <div
            className={
              typeof pageMessage === 'string'
                ? 'mb-4 bg-ocean-700 border border-ocean-500 rounded-xl px-4 py-3 flex items-start gap-3'
                : 'mb-4 bg-red-950 border border-red-700 rounded-xl px-4 py-3 flex items-start gap-3'
            }
          >
            <div className="flex-1 text-sm text-left">
              {typeof pageMessage === 'string' ? (
                <span className="text-ocean-300">{pageMessage}</span>
              ) : (
                <>
                  <p className="font-semibold text-red-100 flex items-center gap-2 mb-1">
                    <span>✕</span>
                    {pageMessage.title}
                  </p>
                  {pageMessage.body && (
                    <p className="text-red-200 whitespace-pre-line">{pageMessage.body}</p>
                  )}
                </>
              )}
            </div>
            <button
              className={
                typeof pageMessage === 'string'
                  ? 'text-ocean-500 hover:text-ocean-300 shrink-0 text-xs'
                  : 'text-red-300 hover:text-red-100 shrink-0 text-xs'
              }
              onClick={() => setPageMessage(null)}
            >
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40 text-ocean-400">{STRINGS.join.loading}</div>
        ) : approvedTeams.length === 0 ? (
          <p className="text-ocean-400 text-center py-12">{STRINGS.join.noTeamsYet}</p>
        ) : (
          <div className="space-y-3 mb-6">
            {approvedTeams.map(team => (
              <button
                key={team.id}
                onClick={() => setSelectedTeam(team)}
                className="w-full card-elevated flex items-center gap-4 hover:bg-ocean-500 transition-colors text-left"
              >
                <TeamEmoji imageId={team.image_id} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-ocean-50 truncate">{team.name}</p>
                  <p className="text-sm text-ocean-300">{STRINGS.join.memberCount(team.member_count ?? 0)}</p>
                </div>
                <span className="text-ocean-400 text-lg">›</span>
              </button>
            ))}
          </div>
        )}

        {teamCreationEnabled ? (
          <button
            className="btn-secondary w-full"
            onClick={() => navigate('/join/create')}
          >
            {STRINGS.join.createButton}
          </button>
        ) : (
          <p className="text-center text-ocean-400 text-sm py-4">
            {STRINGS.join.teamCreationClosed}
          </p>
        )}
      </div>

      {selectedTeam && (
        <JoinForm team={selectedTeam} onClose={() => setSelectedTeam(null)} />
      )}
    </div>
  )
}
