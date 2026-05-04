import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { adminApi } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { TeamEmoji } from '../../components/ImagePicker'
import { STRINGS } from '../../strings'
import type { Team } from '../../types'

export default function PendingTeams() {
  const { showToast } = useToast()
  const [teams, setTeams] = useState<Team[]>([])
  const [rejectMessages, setRejectMessages] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const ts = await adminApi.getTeams()
      setTeams(ts.filter((t: Team) => t.status === 'pending'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('pending-teams-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function approve(teamId: string) {
    try {
      await adminApi.approveTeam(teamId)
      showToast('Team approved!', 'success')
      load()
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  async function reject(teamId: string) {
    try {
      await adminApi.rejectTeam(teamId, rejectMessages[teamId])
      showToast('Team rejected.', 'info')
      load()
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  if (loading) return <div className="p-5 text-ocean-400">{STRINGS.admin.loading}</div>

  return (
    <div className="p-5 max-w-2xl mx-auto">
      <h1 className="font-heading text-2xl font-bold text-ocean-50 mb-6 mt-2">Pending teams</h1>

      {teams.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-ocean-400">No pending teams. You're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map(team => (
            <div key={team.id} className="card space-y-4">
              <div className="flex items-center gap-4">
                <TeamEmoji imageId={team.image_id} size="lg" />
                <div className="flex-1">
                  <p className="font-heading font-bold text-xl text-ocean-50">{team.name}</p>
                  <p className="text-ocean-400 text-sm">Created by: {team.creator_name}</p>
                  <p className="text-ocean-400 text-xs mt-0.5">
                    Passcode: <span className="font-mono text-ocean-200">{team.passcode}</span>
                  </p>
                </div>
              </div>

              <input
                className="input text-sm"
                placeholder="Rejection message (optional)..."
                value={rejectMessages[team.id] ?? ''}
                onChange={e => setRejectMessages(prev => ({ ...prev, [team.id]: e.target.value }))}
              />

              <div className="flex gap-3">
                <button className="btn-primary flex-1" onClick={() => approve(team.id)}>
                  ✓ Approve
                </button>
                <button className="btn-danger flex-1" onClick={() => reject(team.id)}>
                  ✗ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
