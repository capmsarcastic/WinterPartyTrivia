import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { TeamEmoji } from '../../components/ImagePicker'
import { ImagePicker } from '../../components/ImagePicker'
import type { Player, Team } from '../../types'

interface EditState {
  name: string
  imageId: string
  passcode: string
}

export default function TeamManagement() {
  const { showToast } = useToast()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ name: '', imageId: '', passcode: '' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bonusTeamId, setBonusTeamId] = useState('')
  const [bonusPoints, setBonusPoints] = useState('')
  const [bonusNote, setBonusNote] = useState('')

  async function load() {
    try {
      const ts = await adminApi.getTeams()
      setTeams(ts.filter((t: Team) => t.status === 'approved'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function startEdit(team: Team) {
    setEditingId(team.id)
    setEditState({ name: team.name, imageId: team.image_id, passcode: team.passcode ?? '' })
  }

  async function saveEdit(teamId: string) {
    try {
      await adminApi.updateTeam(teamId, {
        name: editState.name,
        image_id: editState.imageId,
        passcode: editState.passcode || undefined,
      })
      showToast('Team updated.', 'success')
      setEditingId(null)
      load()
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  async function deleteTeam(team: Team) {
    if (!window.confirm(`Delete "${team.name}"? All members will be removed.`)) return
    try {
      await adminApi.deleteTeam(team.id)
      showToast(`"${team.name}" deleted.`, 'info')
      load()
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  async function bootPlayer(teamId: string, player: Player) {
    if (!window.confirm(`Boot ${player.display_name}? The team passcode will rotate.`)) return
    try {
      const res = await adminApi.bootPlayer(teamId, player.id) as { new_passcode: string }
      showToast(`Booted. New passcode: ${res.new_passcode}`, 'success')
      load()
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  async function awardBonus() {
    if (!bonusTeamId || !bonusPoints || !bonusNote.trim()) return
    try {
      await adminApi.createScoreEvent({ team_id: bonusTeamId, points: parseFloat(bonusPoints), note: bonusNote, category: 'bonus' })
      setBonusTeamId(''); setBonusPoints(''); setBonusNote('')
      showToast('Score event created.', 'success')
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  if (loading) return <div className="p-5 text-ocean-400">Loading...</div>

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-6">
      <h1 className="font-heading text-2xl font-bold text-ocean-50 mt-2">Teams</h1>

      {/* Bonus points panel */}
      <div className="card space-y-3">
        <h2 className="font-heading font-bold text-ocean-200">Award / deduct points</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className="input text-sm col-span-2 md:col-span-1" value={bonusTeamId} onChange={e => setBonusTeamId(e.target.value)}>
            <option value="">Select team...</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input className="input text-sm" type="number" placeholder="Points (use − for deduction)" value={bonusPoints} onChange={e => setBonusPoints(e.target.value)} />
          <input className="input text-sm col-span-2 md:col-span-1" placeholder="Reason / note" value={bonusNote} onChange={e => setBonusNote(e.target.value)} />
          <button className="btn-primary btn-sm" onClick={awardBonus} disabled={!bonusTeamId || !bonusPoints || !bonusNote.trim()}>
            Award
          </button>
        </div>
      </div>

      {teams.length === 0 && <p className="text-ocean-400 text-center py-8">No approved teams yet.</p>}

      {teams.map(team => {
        const isExpanded = expandedId === team.id
        const isEditing = editingId === team.id

        return (
          <div key={team.id} className="card space-y-4">
            {/* Header row */}
            <div className="flex items-center gap-3">
              <TeamEmoji imageId={team.image_id} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-ocean-50 truncate">{team.name}</p>
                <p className="text-sm text-ocean-400">
                  Score: <span className="text-ocean-200 font-medium">{team.total_score ?? 0}</span>
                  {' · '}
                  Passcode: <span className="font-mono text-ocean-200">{team.passcode}</span>
                  {' · '}
                  {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button className="btn-secondary btn-sm" onClick={() => startEdit(team)}>Edit</button>
                <button className="btn-ghost btn-sm" onClick={() => setExpandedId(isExpanded ? null : team.id)}>
                  {isExpanded ? '▲' : '▼'}
                </button>
                <button className="btn-danger btn-sm" onClick={() => deleteTeam(team)}>Delete</button>
              </div>
            </div>

            {/* Edit form */}
            {isEditing && (
              <div className="border-t border-ocean-600 pt-4 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Team name</label>
                    <input className="input" value={editState.name} onChange={e => setEditState(s => ({ ...s, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">New passcode (leave blank to keep)</label>
                    <input className="input font-mono tracking-widest" maxLength={4} value={editState.passcode}
                      onChange={e => setEditState(s => ({ ...s, passcode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      placeholder="4 digits" inputMode="numeric" />
                  </div>
                </div>
                <div>
                  <label className="label">Team image</label>
                  <ImagePicker value={editState.imageId} onChange={id => setEditState(s => ({ ...s, imageId: id }))} />
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => saveEdit(team.id)}>Save</button>
                  <button className="btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Members */}
            {isExpanded && (
              <div className="border-t border-ocean-600 pt-4">
                <p className="text-sm font-medium text-ocean-300 mb-3">Members</p>
                {!team.members || team.members.length === 0 ? (
                  <p className="text-ocean-500 text-sm">No active members.</p>
                ) : (
                  <div className="space-y-2">
                    {team.members.map((m: Player) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 bg-ocean-700/50 rounded-lg px-3 py-2">
                        <span className="text-sm text-ocean-100">{m.display_name}</span>
                        <button className="text-xs text-red-400 hover:text-red-300" onClick={() => bootPlayer(team.id, m)}>
                          Boot
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
