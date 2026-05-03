import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { TeamEmoji } from '../../components/ImagePicker'

interface LeaderboardEntry {
  rank: number
  team_id: string
  name: string
  image_id: string
  total_score: number
  breakdown: Record<string, number>
}

const RANK_EMOJI = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const { showToast } = useToast()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [broadcastLoading, setBroadcastLoading] = useState(false)

  async function load() {
    try {
      const data = await adminApi.getLeaderboard()
      setEntries(data as LeaderboardEntry[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 15_000)
    return () => clearInterval(interval)
  }, [])

  async function broadcastLeaderboard() {
    setBroadcastLoading(true)
    try {
      const lines = entries.map(e =>
        `${e.rank}. ${e.name} — ${e.total_score} pts`
      ).join('\n')
      await adminApi.broadcast(`🏆 Current standings:\n\n${lines}`)
      showToast('Leaderboard broadcast sent!', 'success')
    } catch (err: unknown) {
      showToast((err as Error).message, 'error')
    } finally {
      setBroadcastLoading(false)
    }
  }

  async function pushLeaderboard() {
    try {
      await adminApi.push('leaderboard_moment', {})
      showToast('Pushed leaderboard to all players.', 'success')
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  if (loading) return <div className="p-5 text-ocean-400">Loading...</div>

  const categories = entries.length > 0
    ? Array.from(new Set(entries.flatMap(e => Object.keys(e.breakdown))))
    : []

  return (
    <div className="p-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mt-2 mb-6 flex-wrap gap-3">
        <h1 className="font-heading text-2xl font-bold text-ocean-50">Leaderboard</h1>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
          <button className="btn-secondary btn-sm" onClick={broadcastLeaderboard} disabled={broadcastLoading}>
            Broadcast standings
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="card text-center py-12 text-ocean-400">No scores yet.</div>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <div
              key={entry.team_id}
              className={`card flex items-center gap-4 ${
                entry.rank === 1 ? 'border border-yellow-500/50 bg-yellow-900/10' :
                entry.rank === 2 ? 'border border-ocean-300/30' :
                entry.rank === 3 ? 'border border-amber-700/30' : ''
              }`}
            >
              <div className="text-2xl w-8 text-center shrink-0">
                {RANK_EMOJI[entry.rank - 1] ?? <span className="text-ocean-500 font-mono text-lg">#{entry.rank}</span>}
              </div>
              <TeamEmoji imageId={entry.image_id} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-ocean-50 truncate">{entry.name}</p>
                {categories.length > 1 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {categories.map(cat => entry.breakdown[cat] != null && (
                      <span key={cat} className="text-xs text-ocean-400">
                        {cat}: <span className="text-ocean-200">{entry.breakdown[cat]}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-heading font-bold text-2xl text-ocean-300">{entry.total_score}</p>
                <p className="text-xs text-ocean-500">pts</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
