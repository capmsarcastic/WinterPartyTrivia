import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import type { Question, Round } from '../../types'

const STATE_LABELS: Record<string, string> = {
  draft: 'Draft', open: 'Open', locked: 'Locked', marked: 'Marked', revealed: 'Revealed',
}
const NEXT_ACTION: Record<string, string> = {
  draft: 'Open round →', open: 'Lock round →', locked: 'Go to marking →',
  marked: 'Reveal results →',
}

interface QuestionFormProps {
  roundId: string
  question?: Question
  onSave: () => void
  onCancel: () => void
  defaultPoints: number
}

function QuestionForm({ roundId, question, onSave, onCancel, defaultPoints }: QuestionFormProps) {
  const { showToast } = useToast()
  const [promptText, setPromptText] = useState(question?.prompt_text ?? '')
  const [promptImage, setPromptImage] = useState(question?.prompt_image_url ?? '')
  const [inputType, setInputType] = useState(question?.input_type ?? 'free_text')
  const [correctAnswer, setCorrectAnswer] = useState(
    question?.correct_answer_json != null ? String(question.correct_answer_json) : ''
  )
  const [markingNotes, setMarkingNotes] = useState(question?.marking_notes ?? '')
  const [points, setPoints] = useState(question?.points != null ? String(question.points) : '')
  const [options, setOptions] = useState(
    inputType === 'multiple_choice'
      ? ((question?.input_config_json as { options?: string[] })?.options ?? []).join('\n')
      : ''
  )
  const [allowMulti, setAllowMulti] = useState(
    (question?.input_config_json as { allow_multiple_selections?: boolean })?.allow_multiple_selections ?? false
  )
  const [scoringMode, setScoringMode] = useState(
    (question?.input_config_json as { scoring_mode?: string })?.scoring_mode ?? 'exact'
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const inputConfig: Record<string, unknown> = {}
      if (inputType === 'multiple_choice') {
        inputConfig.options = options.split('\n').map(o => o.trim()).filter(Boolean)
        inputConfig.allow_multiple_selections = allowMulti
      } else if (inputType === 'numeric') {
        inputConfig.scoring_mode = scoringMode
        inputConfig.decimal_places = 0
      }

      const payload = {
        prompt_text: promptText || null,
        prompt_image_url: promptImage || null,
        input_type: inputType,
        input_config_json: inputConfig,
        correct_answer_json: correctAnswer || null,
        marking_notes: markingNotes || null,
        points: points ? parseFloat(points) : null,
      }

      if (question) {
        await adminApi.updateQuestion(question.id, payload)
      } else {
        await adminApi.createQuestion(roundId, payload)
      }
      onSave()
    } catch (err: unknown) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-ocean-700 rounded-xl p-4 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="label">Question text (optional if image provided)</label>
          <input className="input" value={promptText} onChange={e => setPromptText(e.target.value)} placeholder="e.g. What year was the company founded?" />
        </div>
        <div>
          <label className="label">Prompt image URL (optional)</label>
          <input className="input text-sm" value={promptImage} onChange={e => setPromptImage(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label className="label">Input type</label>
          <select className="input" value={inputType} onChange={e => setInputType(e.target.value as 'multiple_choice' | 'free_text' | 'numeric')}>
            <option value="free_text">Free text</option>
            <option value="multiple_choice">Multiple choice</option>
            <option value="numeric">Numeric</option>
          </select>
        </div>
      </div>

      {inputType === 'multiple_choice' && (
        <div className="space-y-3">
          <div>
            <label className="label">Options (one per line)</label>
            <textarea className="input resize-none" rows={4} value={options} onChange={e => setOptions(e.target.value)} placeholder={"Option A\nOption B\nOption C"} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allowMulti} onChange={e => setAllowMulti(e.target.checked)} className="rounded" />
            <span className="text-sm text-ocean-200">Allow multiple selections</span>
          </label>
        </div>
      )}

      {inputType === 'numeric' && (
        <div>
          <label className="label">Scoring mode</label>
          <select className="input" value={scoringMode} onChange={e => setScoringMode(e.target.value)}>
            <option value="exact">Exact match</option>
            <option value="closest_wins">Closest wins</option>
          </select>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="label">Correct answer</label>
          <input className="input" value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)} placeholder="Reference answer..." />
        </div>
        <div>
          <label className="label">Marking notes (admin only)</label>
          <input className="input" value={markingNotes} onChange={e => setMarkingNotes(e.target.value)} placeholder="Acceptable variants..." />
        </div>
        <div>
          <label className="label">Points (default: {defaultPoints})</label>
          <input className="input" type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder={String(defaultPoints)} />
        </div>
      </div>

      <div className="flex gap-2">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : question ? 'Save changes' : 'Add question'}
        </button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function RoundManagement() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [rounds, setRounds] = useState<Round[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [roundQuestions, setRoundQuestions] = useState<Record<string, Question[]>>({})
  const [addingQuestion, setAddingQuestion] = useState<string | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [showNewRound, setShowNewRound] = useState(false)
  const [newRoundTitle, setNewRoundTitle] = useState('')
  const [newRoundPts, setNewRoundPts] = useState('1')
  const [csvText, setCsvText] = useState('')
  const [showCsvId, setShowCsvId] = useState<string | null>(null)

  async function load() {
    const rs = await adminApi.getRounds()
    setRounds(rs as Round[])
  }

  async function loadQuestions(roundId: string) {
    const qs = await adminApi.getQuestions(roundId)
    setRoundQuestions(prev => ({ ...prev, [roundId]: qs as Question[] }))
  }

  useEffect(() => { load() }, [])

  async function createRound() {
    if (!newRoundTitle.trim()) return
    try {
      await adminApi.createRound({ title: newRoundTitle.trim(), points_per_correct: parseFloat(newRoundPts) || 1 })
      setNewRoundTitle(''); setNewRoundPts('1'); setShowNewRound(false)
      showToast('Round created.', 'success')
      load()
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  async function deleteRound(r: Round) {
    if (!window.confirm(`Delete "${r.title}"?`)) return
    await adminApi.deleteRound(r.id)
    showToast('Round deleted.', 'info')
    load()
  }

  async function advanceRound(roundId: string) {
    try {
      const res = await adminApi.advanceRound(roundId) as { new_state: string }
      showToast(`Round advanced to: ${res.new_state}`, 'success')
      if (res.new_state === 'locked') navigate(`/admin/rounds/${roundId}/marking`)
      load()
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  async function revertRound(roundId: string) {
    if (!window.confirm('Revert round to previous state?')) return
    try {
      await adminApi.revertRound(roundId)
      load()
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  async function deleteQuestion(qId: string, roundId: string) {
    if (!window.confirm('Delete this question?')) return
    await adminApi.deleteQuestion(qId)
    loadQuestions(roundId)
  }

  async function importCsv(roundId: string) {
    if (!csvText.trim()) return
    try {
      const res = await adminApi.csvImport(roundId, csvText) as { created: number }
      showToast(`Imported ${res.created} questions.`, 'success')
      setCsvText(''); setShowCsvId(null)
      loadQuestions(roundId)
    } catch (err: unknown) { showToast((err as Error).message, 'error') }
  }

  function toggleExpand(roundId: string) {
    if (expandedId === roundId) {
      setExpandedId(null)
    } else {
      setExpandedId(roundId)
      loadQuestions(roundId)
    }
  }

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="font-heading text-2xl font-bold text-ocean-50">Rounds</h1>
        <button className="btn-primary btn-sm" onClick={() => setShowNewRound(v => !v)}>+ New round</button>
      </div>

      {showNewRound && (
        <div className="card space-y-3">
          <h2 className="font-heading font-bold text-ocean-200">New round</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="label">Title</label>
              <input className="input" value={newRoundTitle} onChange={e => setNewRoundTitle(e.target.value)} placeholder="Round 1: General Knowledge" autoFocus />
            </div>
            <div>
              <label className="label">Points per correct</label>
              <input className="input" type="number" value={newRoundPts} onChange={e => setNewRoundPts(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={createRound} disabled={!newRoundTitle.trim()}>Create</button>
            <button className="btn-ghost" onClick={() => setShowNewRound(false)}>Cancel</button>
          </div>
        </div>
      )}

      {rounds.length === 0 && !showNewRound && (
        <div className="card text-center py-12 text-ocean-400">No rounds yet. Create one above.</div>
      )}

      {rounds.map(round => {
        const isExpanded = expandedId === round.id
        const questions = roundQuestions[round.id] ?? []
        const canAdvance = round.lifecycle_state !== 'revealed'

        return (
          <div key={round.id} className="card space-y-3">
            {/* Round header */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-ocean-50">{round.title}</p>
                <p className="text-xs text-ocean-400">{round.question_count ?? questions.length} questions · {round.points_per_correct}pt default</p>
              </div>
              <span className={`badge ${
                round.lifecycle_state === 'open' ? 'badge-open' :
                round.lifecycle_state === 'locked' ? 'badge-locked' :
                round.lifecycle_state === 'marked' ? 'badge-marked' :
                round.lifecycle_state === 'revealed' ? 'badge-revealed' : 'badge-draft'
              }`}>
                {STATE_LABELS[round.lifecycle_state]}
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {canAdvance && (
                  <button className="btn-primary btn-sm" onClick={() => advanceRound(round.id)}>
                    {NEXT_ACTION[round.lifecycle_state] ?? 'Advance'}
                  </button>
                )}
                {round.lifecycle_state === 'locked' && (
                  <button className="btn-secondary btn-sm" onClick={() => navigate(`/admin/rounds/${round.id}/marking`)}>
                    Marking grid
                  </button>
                )}
                {round.lifecycle_state !== 'draft' && (
                  <button className="btn-ghost btn-sm" onClick={() => revertRound(round.id)}>← Revert</button>
                )}
                <button className="btn-ghost btn-sm" onClick={() => toggleExpand(round.id)}>
                  {isExpanded ? '▲ Hide' : '▼ Questions'}
                </button>
                <button className="btn-danger btn-sm" onClick={() => deleteRound(round)}>Delete</button>
              </div>
            </div>

            {/* Questions list */}
            {isExpanded && (
              <div className="border-t border-ocean-600 pt-4 space-y-3">
                {questions.map((q, i) => (
                  <div key={q.id}>
                    {editingQuestion?.id === q.id ? (
                      <QuestionForm
                        roundId={round.id}
                        question={q}
                        defaultPoints={round.points_per_correct}
                        onSave={() => { setEditingQuestion(null); loadQuestions(round.id) }}
                        onCancel={() => setEditingQuestion(null)}
                      />
                    ) : (
                      <div className="flex items-start gap-3 bg-ocean-700/50 rounded-xl p-3">
                        <span className="text-ocean-500 text-sm font-mono mt-0.5 w-6 shrink-0">Q{q.order}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ocean-100 truncate">{q.prompt_text || <em className="text-ocean-500">No text</em>}</p>
                          <p className="text-xs text-ocean-400 mt-0.5">{q.input_type} · {q.points ?? round.points_per_correct}pt</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button className="btn-ghost btn-sm text-xs" onClick={() => setEditingQuestion(q)}>Edit</button>
                          <button className="btn-ghost btn-sm text-xs text-red-400" onClick={() => deleteQuestion(q.id, round.id)}>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {addingQuestion === round.id ? (
                  <QuestionForm
                    roundId={round.id}
                    defaultPoints={round.points_per_correct}
                    onSave={() => { setAddingQuestion(null); loadQuestions(round.id) }}
                    onCancel={() => setAddingQuestion(null)}
                  />
                ) : (
                  <div className="flex gap-2">
                    <button className="btn-secondary btn-sm" onClick={() => setAddingQuestion(round.id)}>+ Add question</button>
                    <button className="btn-ghost btn-sm" onClick={() => setShowCsvId(showCsvId === round.id ? null : round.id)}>CSV import</button>
                  </div>
                )}

                {showCsvId === round.id && (
                  <div className="space-y-2">
                    <p className="text-xs text-ocean-400">
                      CSV columns: <code className="text-ocean-300">order, prompt_text, input_type, options_json, correct_answer, marking_notes, points</code>
                    </p>
                    <textarea className="input resize-none font-mono text-xs" rows={6} value={csvText} onChange={e => setCsvText(e.target.value)} placeholder="order,prompt_text,input_type,..." />
                    <div className="flex gap-2">
                      <button className="btn-primary btn-sm" onClick={() => importCsv(round.id)}>Import</button>
                      <button className="btn-ghost btn-sm" onClick={() => setShowCsvId(null)}>Cancel</button>
                    </div>
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
