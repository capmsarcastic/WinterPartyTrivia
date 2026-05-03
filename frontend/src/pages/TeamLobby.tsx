import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { playerApi } from '../lib/api'
import { usePlayer } from '../contexts/PlayerContext'
import { useDeviceId } from '../hooks/useDeviceId'
import { useToast } from '../contexts/ToastContext'
import { TeamEmoji } from '../components/ImagePicker'
import { STRINGS } from '../strings'
import type { Message, Player, Round, ScoreEvent, Team } from '../types'

function RoundBadge({ state }: { state: string }) {
  const classMap: Record<string, string> = {
    draft: 'badge-draft', open: 'badge-open', locked: 'badge-locked',
    marked: 'badge-marked', revealed: 'badge-revealed',
  }
  return (
    <span className={classMap[state] || 'badge-draft'}>
      {STRINGS.lobby.roundStateLabels[state] || state}
    </span>
  )
}

export default function TeamLobby() {
  const { teamId } = useParams<{ teamId: string }>()
  const navigate = useNavigate()
  const deviceId = useDeviceId()
  const { player, team, setSession, clearSession, updateTeam } = usePlayer()
  const { showToast } = useToast()

  const [members, setMembers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [scoreEvents, setScoreEvents] = useState<ScoreEvent[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [passcodeVisible, setPasscodeVisible] = useState(false)
  const [passcode, setPasscode] = useState<string | null>(null)
  const [showMessageForm, setShowMessageForm] = useState(false)
  const [messageText, setMessageText] = useState('')
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Redirect if not logged in
  useEffect(() => {
    if (!player || !team || team.id !== teamId) {
      navigate('/join', { replace: true })
    }
  }, [player, team, teamId])

  async function loadData() {
    if (!teamId) return
    const [membersRes, roundsRes, scoreRes, msgRes] = await Promise.allSettled([
      supabase.from('players').select('*').eq('team_id', teamId).eq('status', 'active'),
      supabase.from('rounds').select('*').neq('lifecycle_state', 'draft').order('order'),
      supabase.from('score_events').select('*').eq('team_id', teamId).order('awarded_at', { ascending: false }),
      supabase.from('messages')
        .select('*')
        .or(`target_type.eq.broadcast,and(target_type.eq.team,target_id.eq.${teamId})`)
        .order('sent_at', { ascending: false })
        .limit(20),
    ])

    if (membersRes.status === 'fulfilled' && membersRes.value.data) setMembers(membersRes.value.data)
    if (roundsRes.status === 'fulfilled' && roundsRes.value.data) setRounds(roundsRes.value.data)
    if (scoreRes.status === 'fulfilled' && scoreRes.value.data) setScoreEvents(scoreRes.value.data)
    if (msgRes.status === 'fulfilled' && msgRes.value.data) setMessages(msgRes.value.data)
  }

  useEffect(() => {
    if (!teamId) return
    loadData()

    const ch = supabase
      .channel(`lobby-${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${teamId}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'score_events', filter: `team_id=eq.${teamId}` }, loadData)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadData()
        showToast('New message from admin 📨', 'info')
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` }, (payload) => {
        const updated = payload.new as Team
        if (updated.status === 'deleted') {
          clearSession()
          navigate('/join', { replace: true, state: { message: updated.rejection_message } })
        } else {
          updateTeam(updated)
        }
      })
      .subscribe()

    // Heartbeat every 30s
    heartbeatRef.current = setInterval(() => {
      if (player) playerApi.heartbeat(deviceId, player.id).catch(() => {})
    }, 30_000)

    return () => {
      supabase.removeChannel(ch)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [teamId])

  const totalScore = scoreEvents.reduce((sum, e) => sum + e.points, 0)

  async function handleBoot(targetPlayer: Player) {
    if (!player || !team || !window.confirm(STRINGS.lobby.bootConfirm(targetPlayer.display_name))) return
    try {
      const res = await playerApi.bootMember(deviceId, team.id, player.id, targetPlayer.id) as { new_passcode: string }
      showToast(`${targetPlayer.display_name} has been removed. New passcode: ${res.new_passcode}`, 'success')
      loadData()
    } catch (err: unknown) {
      showToast((err as Error).message || STRINGS.errors.generic, 'error')
    }
  }

  async function handleLeave() {
    if (!player || !window.confirm(STRINGS.lobby.leaveConfirm)) return
    await playerApi.leaveTeam(deviceId, player.id).catch(() => {})
    clearSession()
    navigate('/join', { replace: true })
  }

  async function handleSendMessage() {
    if (!player || !messageText.trim()) return
    await playerApi.sendMessage(deviceId, player.id, player.display_name, messageText.trim())
    setMessageText('')
    setShowMessageForm(false)
    showToast('Message sent!', 'success')
  }

  if (!player || !team) return null

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 flex items-center gap-4">
        <TeamEmoji imageId={team.image_id} size="lg" />
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold text-ocean-50">{team.name}</h1>
          <p className="text-ocean-300 text-sm">Hi, {player.display_name}!</p>
        </div>
      </div>

      <div className="flex-1 px-5 pb-8 space-y-5 overflow-y-auto">
        {/* Score */}
        <div className="card-elevated text-center">
          <p className="text-ocean-300 text-xs uppercase tracking-widest mb-1">{STRINGS.lobby.scoreLabel}</p>
          <p className="font-heading text-4xl font-black text-ocean-400">{totalScore.toLocaleString()}</p>
        </div>

        {/* Passcode */}
        <div className="card">
          <button
            className="w-full text-left flex items-center justify-between"
            onClick={() => setPasscodeVisible(v => !v)}
          >
            <span className="text-sm text-ocean-300">{STRINGS.lobby.passcodeReveal}</span>
            {passcodeVisible ? <span className="font-mono font-bold text-ocean-100 text-lg tracking-widest">{team.passcode || '????'}</span>
              : <span className="font-mono text-ocean-600 tracking-widest">••••</span>}
          </button>
        </div>

        {/* Members */}
        <div className="card">
          <h2 className="font-heading font-bold text-ocean-200 mb-3 text-sm uppercase tracking-wide">
            {STRINGS.lobby.membersLabel}
          </h2>
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${Date.now() - new Date(m.last_seen_at).getTime() < 60_000 ? 'bg-green-400' : 'bg-ocean-600'}`} />
                  <span className={`text-sm ${m.id === player.id ? 'text-ocean-200 font-medium' : 'text-ocean-300'}`}>
                    {m.display_name}{m.id === player.id && ' (you)'}
                  </span>
                </div>
                {m.id !== player.id && (
                  <button
                    onClick={() => handleBoot(m)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5"
                  >
                    {STRINGS.lobby.bootButton}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Rounds */}
        <div className="card">
          <h2 className="font-heading font-bold text-ocean-200 mb-3 text-sm uppercase tracking-wide">
            {STRINGS.lobby.roundsLabel}
          </h2>
          {rounds.length === 0 ? (
            <p className="text-ocean-400 text-sm">{STRINGS.lobby.noRoundsYet}</p>
          ) : (
            <div className="space-y-3">
              {rounds.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-ocean-100 text-sm font-medium truncate">{r.title}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <RoundBadge state={r.lifecycle_state} />
                    {r.lifecycle_state === 'open' && (
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => navigate(`/team/${team.id}/round/${r.id}`)}
                      >
                        Answer
                      </button>
                    )}
                    {r.lifecycle_state === 'revealed' && (
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => navigate(`/team/${team.id}/round/${r.id}/results`)}
                      >
                        {STRINGS.lobby.viewResults}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Score history */}
        {scoreEvents.length > 0 && (
          <div className="card">
            <h2 className="font-heading font-bold text-ocean-200 mb-3 text-sm uppercase tracking-wide">
              {STRINGS.lobby.scoreHistoryLabel}
            </h2>
            <div className="space-y-2">
              {scoreEvents.map(e => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-ocean-300 flex-1 min-w-0 truncate">{e.note}</span>
                  <span className={`font-bold ml-3 shrink-0 ${e.points >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {e.points >= 0 ? '+' : ''}{e.points}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div className="card">
            <h2 className="font-heading font-bold text-ocean-200 mb-3 text-sm uppercase tracking-wide">
              {STRINGS.lobby.messagesLabel}
            </h2>
            <div className="space-y-2">
              {messages.slice(0, 5).map(m => (
                <div key={m.id} className="bg-ocean-700 rounded-lg p-3">
                  <p className="text-xs text-ocean-400 mb-1">
                    {m.target_type === 'broadcast' ? STRINGS.messages.broadcastBadge : STRINGS.messages.adminBadge}
                  </p>
                  <p className="text-sm text-ocean-100">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message admin */}
        <div className="card">
          {showMessageForm ? (
            <div className="space-y-3">
              <textarea
                className="input resize-none"
                rows={3}
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                placeholder={STRINGS.messages.placeholder}
                autoFocus
              />
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={handleSendMessage} disabled={!messageText.trim()}>
                  {STRINGS.messages.sendButton}
                </button>
                <button className="btn-ghost" onClick={() => setShowMessageForm(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary w-full" onClick={() => setShowMessageForm(true)}>
              {STRINGS.lobby.messageAdminButton}
            </button>
          )}
        </div>

        {/* Leave */}
        <button onClick={handleLeave} className="btn-ghost w-full text-sm text-red-400">
          {STRINGS.lobby.leaveTeam}
        </button>
      </div>
    </div>
  )
}
