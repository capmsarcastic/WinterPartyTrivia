import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api'
import type { ActivityLogEntry } from '../../types'

const EVENT_ICONS: Record<string, string> = {
  admin_login: '🔐',
  team_created: '🆕',
  team_approved: '✅',
  team_rejected: '❌',
  team_deleted: '🗑️',
  team_updated: '✏️',
  team_creation_locked: '🔒',
  player_joined: '👋',
  player_left: '👋',
  player_booted_by_admin: '🦵',
  player_booted_by_member: '🦵',
  round_created: '📋',
  round_open: '🟢',
  round_locked: '🔒',
  round_marked: '✍️',
  round_revealed: '🎉',
  round_scores_committed: '💯',
  broadcast_sent: '📢',
  admin_push: '📲',
  score_event_created: '🏅',
  team_cancelled: '✕',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function ActivityLog() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  async function load(limit = 200) {
    try {
      const data = await adminApi.getActivityLog(limit)
      setEntries(data as ActivityLogEntry[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = filter
    ? entries.filter(e =>
        e.event_type.includes(filter.toLowerCase()) ||
        (e.actor_name ?? '').toLowerCase().includes(filter.toLowerCase())
      )
    : entries

  if (loading) return <div className="p-5 text-ocean-400">Loading...</div>

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mt-2 mb-5 flex-wrap gap-3">
        <h1 className="font-heading text-2xl font-bold text-ocean-50">Activity log</h1>
        <div className="flex gap-2">
          <input
            className="input text-sm w-48"
            placeholder="Filter events..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button className="btn-secondary btn-sm" onClick={() => load()}>↻</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-ocean-400">No activity yet.</div>
      ) : (
        <div className="space-y-1">
          {filtered.map(entry => (
            <div
              key={entry.id}
              className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-ocean-700/30 transition-colors"
            >
              <span className="text-xl shrink-0 mt-0.5">
                {EVENT_ICONS[entry.event_type] ?? '•'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ocean-100">
                    {entry.event_type.replace(/_/g, ' ')}
                  </span>
                  {entry.actor_name && (
                    <span className="text-xs text-ocean-400">by {entry.actor_name}</span>
                  )}
                </div>
                {Object.keys(entry.payload_json).length > 0 && (
                  <p className="text-xs text-ocean-500 mt-0.5 truncate">
                    {Object.entries(entry.payload_json)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <span className="text-xs text-ocean-500 shrink-0 mt-0.5">
                {formatDateTime(entry.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
