import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { TeamEmoji } from '../../components/ImagePicker'
import type { Question, Round } from '../../types'

interface TeamAnswers {
  id: string
  name: string
  image_id: string
  answers: Record<string, { selected?: unknown; text?: string; value?: unknown }>
  marks: Record<string, { points_awarded: number; admin_note?: string }>
}

function answerDisplay(value: Record<string, unknown>, inputType: string): string {
  if (!value || Object.keys(value).length === 0) return '—'
  if (inputType === 'multiple_choice') {
    const s = value.selected
    return Array.isArray(s) ? s.join(', ') : String(s ?? '—')
  }
  if (inputType === 'free_text') return String(value.text ?? '—')
  if (inputType === 'numeric') return String(value.value ?? '—')
  return JSON.stringify(value)
}

export default function MarkingGrid() {
  const { roundId } = useParams<{ roundId: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [round, setRound] = useState<Round | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [teams, setTeams] = useState<TeamAnswers[]>([])
  const [localMarks, setLocalMarks] = useState<Record<string, Record<string, { pts: string; note: string }>>>({})
  const [saving, setSaving] = useState(false)
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    if (!roundId) return
    adminApi.getRounds().then((rs: unknown) => {
      const r = (rs as Round[]).find(x => x.id === roundId)
      if (r) setRound(r)
    })
    adminApi.getSubmissions(roundId).then((data: unknown) => {
      const d = data as { teams: TeamAnswers[]; questions: Question[] }
      setQuestions(d.questions)
      setTeams(d.teams)

      const init: typeof localMarks = {}
      for (const team of d.teams) {
        init[team.id] = {}
        for (const q of d.questions) {
          const existing = team.marks[q.id]
          init[team.id][q.id] = {
            pts: existing ? String(existing.points_awarded) : '',
            note: existing?.admin_note ?? '',
          }
        }
      }
      setLocalMarks(init)
    })
  }, [roundId])

  function setMark(teamId: string, qId: string, pts: string, note: string) {
    setLocalMarks(prev => ({
      ...prev,
      [teamId]: { ...(prev[teamId] ?? {}), [qId]: { pts, note } },
    }))
  }

  function autoMark() {
    const next = { ...localMarks }
    for (const team of teams) {
      for (const q of questions) {
        const answer = team.answers[q.id] ?? {}
        const correct = q.correct_answer_json
        const pts = q.points ?? round?.points_per_correct ?? 1

        let awarded = ''
        if (q.input_type === 'multiple_choice' && correct != null) {
          const sel = answer.selected
          const isCorrect = Array.isArray(correct)
            ? JSON.stringify([...(Array.isArray(sel) ? sel : [sel])].sort()) === JSON.stringify([...(correct as string[])].sort())
            : sel === correct
          awarded = isCorrect ? String(pts) : '0'
        } else if (q.input_type === 'numeric' && correct != null) {
          const config = q.input_config_json as { scoring_mode?: string }
          if (config.scoring_mode !== 'closest_wins') {
            awarded = String(answer.value) === String(correct) ? String(pts) : '0'
          }
        }

        if (awarded !== '') {
          next[team.id] = { ...(next[team.id] ?? {}), [q.id]: { pts: awarded, note: next[team.id]?.[q.id]?.note ?? '' } }
        }
      }
    }
    setLocalMarks(next)
    showToast('Auto-marked where possible.', 'info')
  }

  async function saveMarks() {
    setSaving(true)
    try {
      const marks: object[] = []
      for (const [teamId, qMap] of Object.entries(localMarks)) {
        for (const [qId, { pts, note }] of Object.entries(qMap)) {
          marks.push({ team_id: teamId, question_id: qId, points_awarded: parseFloat(pts) || 0, admin_note: note || null })
        }
      }
      await adminApi.updateMarks(marks)
      showToast('Marks saved.', 'success')
    } catch (err: unknown) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function commitScores() {
    if (!roundId) return
    if (!window.confirm('Commit scores? This will sum all marks and create score events, then advance the round to "marked". Scores will only be visible to teams after "Reveal Results".')) return
    setCommitting(true)
    try {
      await saveMarks()
      await adminApi.commitScores(roundId)
      showToast('Scores committed! Round is now marked.', 'success')
      navigate('/admin/rounds')
    } catch (err: unknown) {
      showToast((err as Error).message, 'error')
    } finally {
      setCommitting(false)
    }
  }

  async function finaliseScores() {
    if (!roundId) return
    if (!window.confirm('Reveal results to players? They will now see their scores for this round.')) return
    try {
      await adminApi.finaliseScores(roundId)
      showToast('Results revealed to players!', 'success')
      navigate('/admin/rounds')
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  if (!round) return <div className="p-5 text-ocean-400">Loading...</div>

  return (
    <div className="p-5 max-w-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3 mt-2">
        <div>
          <button className="text-ocean-400 text-sm mb-1 block" onClick={() => navigate('/admin/rounds')}>← Rounds</button>
          <h1 className="font-heading text-xl font-bold text-ocean-50">Marking: {round.title}</h1>
          <p className="text-ocean-400 text-sm">{questions.length} questions · {teams.length} teams</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary btn-sm" onClick={autoMark}>Auto-mark</button>
          <button className="btn-secondary btn-sm" onClick={saveMarks} disabled={saving}>{saving ? 'Saving...' : 'Save marks'}</button>
          {round.lifecycle_state === 'locked' && (
            <button className="btn-primary" onClick={commitScores} disabled={committing}>
              {committing ? 'Committing...' : 'Commit scores →'}
            </button>
          )}
          {round.lifecycle_state === 'marked' && (
            <button className="btn-primary" onClick={finaliseScores}>
              Reveal to players 🎉
            </button>
          )}
        </div>
      </div>

      {/* Marking grid — questions as rows, teams as columns */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-ocean-300 font-medium bg-ocean-800 sticky left-0 z-10 min-w-52">
                Question
              </th>
              {teams.map(team => (
                <th key={team.id} className="text-left px-3 py-2 text-ocean-300 font-medium bg-ocean-800 min-w-44">
                  <div className="flex items-center gap-2">
                    <TeamEmoji imageId={team.image_id} size="sm" />
                    <span className="truncate max-w-32">{team.name}</span>
                  </div>
                </th>
              ))}
              <th className="text-left px-3 py-2 text-ocean-300 font-medium bg-ocean-800 min-w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q, qi) => (
              <tr key={q.id} className={qi % 2 === 0 ? 'bg-ocean-800/30' : 'bg-ocean-700/20'}>
                {/* Question details */}
                <td className="px-3 py-2 sticky left-0 bg-inherit align-top">
                  <div className="space-y-0.5">
                    <p className="font-medium text-ocean-100">Q{q.order}</p>
                    {q.prompt_text && (
                      <p className="text-xs text-ocean-300 max-w-48">{q.prompt_text}</p>
                    )}
                    <p className="text-xs text-ocean-500">{q.input_type} · {q.points ?? round.points_per_correct}pt</p>
                    {q.correct_answer_json != null && (
                      <p className="text-xs text-green-400 max-w-48 truncate">
                        ✓ {String(q.correct_answer_json)}
                      </p>
                    )}
                    {q.marking_notes && (
                      <p className="text-xs text-ocean-400 italic max-w-48 truncate">📝 {q.marking_notes}</p>
                    )}
                  </div>
                </td>

                {/* Each team's answer + marks */}
                {teams.map(team => {
                  const answer = team.answers[q.id] ?? {}
                  const mark = localMarks[team.id]?.[q.id] ?? { pts: '', note: '' }
                  const maxPts = q.points ?? round.points_per_correct

                  return (
                    <td key={team.id} className="px-3 py-2 align-top">
                      <div className="space-y-1.5">
                        <p className="text-xs text-ocean-300 bg-ocean-700/60 rounded px-2 py-1 max-w-40">
                          {answerDisplay(answer as Record<string, unknown>, q.input_type)}
                        </p>
                        <div className="flex gap-1.5 items-center">
                          <input
                            type="number"
                            className="w-16 bg-ocean-700 border border-ocean-600 rounded-lg px-2 py-1 text-sm text-ocean-50 focus:outline-none focus:border-ocean-400"
                            value={mark.pts}
                            onChange={e => setMark(team.id, q.id, e.target.value, mark.note)}
                            placeholder={`0–${maxPts}`}
                            step="0.5"
                          />
                          <span className="text-ocean-500 text-xs">/{maxPts}</span>
                        </div>
                        <input
                          className="w-full bg-ocean-700/50 border border-ocean-700 rounded px-2 py-1 text-xs text-ocean-300 focus:outline-none focus:border-ocean-500 placeholder-ocean-600"
                          value={mark.note}
                          onChange={e => setMark(team.id, q.id, mark.pts, e.target.value)}
                          placeholder="Note (optional)"
                        />
                      </div>
                    </td>
                  )
                })}

                {/* Row total (sum across all teams for this question) */}
                <td className="px-3 py-2 align-top">
                  <span className="text-xs text-ocean-500">
                    {teams.filter(t => {
                      const pts = localMarks[t.id]?.[q.id]?.pts
                      return pts !== '' && !isNaN(parseFloat(pts || ''))
                    }).length}/{teams.length} marked
                  </span>
                </td>
              </tr>
            ))}

            {/* Totals row */}
            <tr className="border-t-2 border-ocean-600 bg-ocean-800/60">
              <td className="px-3 py-2 sticky left-0 bg-ocean-800/60">
                <span className="font-heading font-bold text-ocean-200">Total</span>
              </td>
              {teams.map(team => {
                const total = questions.reduce((sum, q) => {
                  const pts = localMarks[team.id]?.[q.id]?.pts
                  return sum + (parseFloat(pts || '0') || 0)
                }, 0)
                return (
                  <td key={team.id} className="px-3 py-2">
                    <span className="font-heading font-bold text-ocean-200">{total}</span>
                  </td>
                )
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
