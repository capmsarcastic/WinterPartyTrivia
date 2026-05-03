import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import type { Round, Team } from '../../types'

export default function Dashboard() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [teams, setTeams] = useState<Team[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [teamCreationEnabled, setTeamCreationEnabled] = useState(true)
  const [broadcastBody, setBroadcastBody] = useState('')
  const [pushPage, setPushPage] = useState('team_lobby')
  const [pushRoundId, setPushRoundId] = useState('')

  async function loadData() {
    try {
      const [cfg, ts, rs] = await Promise.all([
        adminApi.getEventConfig(),
        adminApi.getTeams(),
        adminApi.getRounds(),
      ])
      setTeamCreationEnabled(cfg.team_creation_enabled)
      setTeams(ts)
      setPendingCount(ts.filter((t: Team) => t.status === 'pending').length)
      setRounds(rs)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadData()
    const ch = supabase.channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function toggleTeamCreation() {
    try {
      await adminApi.updateEventConfig({ team_creation_enabled: !teamCreationEnabled })
      setTeamCreationEnabled(v => !v)
      showToast(`Team creation ${!teamCreationEnabled ? 'opened' : 'closed'}.`, 'success')
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  async function sendBroadcast() {
    if (!broadcastBody.trim()) return
    try {
      await adminApi.broadcast(broadcastBody.trim())
      setBroadcastBody('')
      showToast('Broadcast sent!', 'success')
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  async function sendPush() {
    try {
      const data = pushPage.includes('round') && pushRoundId ? { round_id: pushRoundId } : undefined
      await adminApi.push(pushPage, data)
      showToast(`Pushed "${pushPage}" to all players.`, 'success')
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  const openRound = rounds.find(r => r.lifecycle_state === 'open')
  const approvedTeams = teams.filter(t => t.status === 'approved')

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-6">
      <h1 className="font-heading text-2xl font-bold text-ocean-50 mt-2">Dashboard</h1>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Approved teams', value: approvedTeams.length },
          { label: 'Pending teams', value: pendingCount, alert: pendingCount > 0 },
          { label: 'Rounds', value: rounds.length },
          { label: 'Active round', value: openRound ? openRound.title : 'None' },
        ].map(stat => (
          <div key={stat.label} className={`card text-center ${stat.alert ? 'border border-yellow-500/50' : ''}`}>
            <p className="font-heading font-bold text-2xl text-ocean-100">{stat.value}</p>
            <p className="text-ocean-400 text-xs mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <div className="bg-yellow-900/40 border border-yellow-600/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-yellow-300 font-medium">⏳ {pendingCount} team{pendingCount !== 1 ? 's' : ''} waiting for approval</p>
          <button className="btn-secondary btn-sm" onClick={() => navigate('/admin/pending')}>Review →</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Event controls */}
        <div className="card space-y-4">
          <h2 className="font-heading font-bold text-ocean-200">Event controls</h2>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ocean-100">Team creation</p>
              <p className="text-xs text-ocean-400">{teamCreationEnabled ? 'Players can create teams' : 'Locked — no new teams'}</p>
            </div>
            <button
              onClick={toggleTeamCreation}
              className={`relative w-12 h-6 rounded-full transition-colors ${teamCreationEnabled ? 'bg-green-500' : 'bg-ocean-600'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${teamCreationEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div className="border-t border-ocean-600 pt-4 space-y-3">
            <p className="text-sm font-medium text-ocean-100">Push all players to:</p>
            <select
              className="input text-sm"
              value={pushPage}
              onChange={e => setPushPage(e.target.value)}
            >
              <option value="team_lobby">Team lobby</option>
              <option value="round_answer">Round — answer page</option>
              <option value="round_results">Round — results page</option>
            </select>
            {pushPage.includes('round') && (
              <select
                className="input text-sm"
                value={pushRoundId}
                onChange={e => setPushRoundId(e.target.value)}
              >
                <option value="">Select round...</option>
                {rounds.map(r => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            )}
            <button className="btn-primary w-full" onClick={sendPush}>
              Push navigation
            </button>
          </div>
        </div>

        {/* Broadcast message */}
        <div className="card space-y-3">
          <h2 className="font-heading font-bold text-ocean-200">Broadcast message</h2>
          <textarea
            className="input resize-none"
            rows={4}
            value={broadcastBody}
            onChange={e => setBroadcastBody(e.target.value)}
            placeholder="Message to all players..."
          />
          <button className="btn-primary w-full" onClick={sendBroadcast} disabled={!broadcastBody.trim()}>
            Send broadcast 📢
          </button>
        </div>
      </div>

      {/* Rounds quick view */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-ocean-200">Rounds</h2>
          <button className="btn-secondary btn-sm" onClick={() => navigate('/admin/rounds')}>Manage →</button>
        </div>
        {rounds.length === 0 ? (
          <p className="text-ocean-400 text-sm">No rounds yet.</p>
        ) : (
          <div className="space-y-2">
            {rounds.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b border-ocean-700 last:border-0">
                <div>
                  <p className="text-sm font-medium text-ocean-100">{r.title}</p>
                  <p className="text-xs text-ocean-400">{r.question_count} questions</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${
                    r.lifecycle_state === 'open' ? 'badge-open' :
                    r.lifecycle_state === 'locked' ? 'badge-locked' :
                    r.lifecycle_state === 'marked' ? 'badge-marked' :
                    r.lifecycle_state === 'revealed' ? 'badge-revealed' : 'badge-draft'
                  }`}>
                    {r.lifecycle_state}
                  </span>
                  {r.lifecycle_state === 'locked' && (
                    <button className="btn-secondary btn-sm" onClick={() => navigate(`/admin/rounds/${r.id}/marking`)}>
                      Mark
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
