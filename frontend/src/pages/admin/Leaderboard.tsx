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
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary')

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

  if (loading) return <div className="p-5 text-ocean-400">{STRINGS.admin.loading}</div>

  const categories = entries.length > 0
    ? Array.from(new Set(entries.flatMap(e => Object.keys(e.breakdown))))
    : []

  return (
    <div className="p-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mt-2 mb-4 flex-wrap gap-3">
        <h1 className="font-heading text-2xl font-bold text-ocean-50">Leaderboard</h1>
        <div className="flex gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-ocean-600">
            <button
              className={`px-3 py-1.5 text-sm ${viewMode === 'summary' ? 'bg-ocean-500 text-ocean-50' : 'bg-ocean-700 text-ocean-300 hover:bg-ocean-600'}`}
              onClick={() => setViewMode('summary')}
            >
              Summary
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${viewMode === 'detailed' ? 'bg-ocean-500 text-ocean-50' : 'bg-ocean-700 text-ocean-300 hover:bg-ocean-600'}`}
              onClick={() => setViewMode('detailed')}
            >
              Detailed
            </button>
          </div>
          <button className="btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
          <button className="btn-secondary btn-sm" onClick={broadcastLeaderboard} disabled={broadcastLoading}>
            Broadcast standings
          </button>
        </div>
      </div>

      {/* Detailed table view */}
      {viewMode === 'detailed' && entries.length > 0 && categories.length > 0 && (
        <div className="card mb-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-ocean-300 font-medium">Team</th>
                {categories.map(cat => (
                  <th key={cat} className="text-right px-3 py-2 text-ocean-300 font-medium capitalize">{cat}</th>
                ))}
                <th className="text-right px-3 py-2 text-ocean-200 font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={entry.team_id} className={i % 2 === 0 ? 'bg-ocean-800/30' : ''}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg w-6 text-center">{RANK_EMOJI[entry.rank - 1] ?? `#${entry.rank}`}</span>
                      <TeamEmoji imageId={entry.image_id} size="sm" />
                      <span className="font-medium text-ocean-100 truncate max-w-32">{entry.name}</span>
                    </div>
                  </td>
                  {categories.map(cat => (
                    <td key={cat} className="px-3 py-2 text-right text-ocean-300">
                      {entry.breakdown[cat] != null ? entry.breakdown[cat] : '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-heading font-bold text-ocean-200">{entry.total_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary / card view */}
      {(viewMode === 'summary' || viewMode === 'detailed') && (
        <div>
          {entries.length === 0 ? (
            <div className="card text-center py-12 text-ocean-400">No scores yet.</div>
          ) : (
            <div className="space-y-3">
              {entries.map(entry => {
                const isExpanded = expandedTeamId === entry.team_id
                const breakdownKeys = Object.keys(entry.breakdown)
                return (
                  <div
                    key={entry.team_id}
                    className={`card ${
                      entry.rank === 1 ? 'border border-yellow-500/50 bg-yellow-900/10' :
                      entry.rank === 2 ? 'border border-ocean-300/30' :
                      entry.rank === 3 ? 'border border-amber-700/30' : ''
                    }`}
                  >
                    <div
                      className="flex items-center gap-4 cursor-pointer"
                      onClick={() => setExpandedTeamId(isExpanded ? null : entry.team_id)}
                    >
                      <div className="text-2xl w-8 text-center shrink-0">
                        {RANK_EMOJI[entry.rank - 1] ?? <span className="text-ocean-500 font-mono text-lg">#{entry.rank}</span>}
                      </div>
                      <TeamEmoji imageId={entry.image_id} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-heading font-bold text-ocean-50 truncate">{entry.name}</p>
                        {breakdownKeys.length > 1 && !isExpanded && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {breakdownKeys.map(cat => (
                              <span key={cat} className="text-xs text-ocean-400">
                                {cat}: <span className="text-ocean-200">{entry.breakdown[cat]}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-3">
                        <div>
                          <p className="font-heading font-bold text-2xl text-ocean-300">{entry.total_score}</p>
                          <p className="text-xs text-ocean-500">pts</p>
                        </div>
                        <span className="text-ocean-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded breakdown */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-ocean-700">
                        <p className="text-xs text-ocean-400 uppercase tracking-wide mb-2">Score breakdown</p>
                        <div className="space-y-1">
                          {breakdownKeys.map(cat => (
                            <div key={cat} className="flex justify-between text-sm">
                              <span className="text-ocean-300 capitalize">{cat}</span>
                              <span className={`font-medium ${entry.breakdown[cat] >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {entry.breakdown[cat] >= 0 ? '+' : ''}{entry.breakdown[cat]}
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm border-t border-ocean-700 pt-1 mt-1">
                            <span className="font-medium text-ocean-200">Total</span>
                            <span className="font-heading font-bold text-ocean-100">{entry.total_score}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
