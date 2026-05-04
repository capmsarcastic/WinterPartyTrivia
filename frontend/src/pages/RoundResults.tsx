import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePlayer } from '../contexts/PlayerContext'
import { QuestionInput } from '../components/QuestionInput'
import { STRINGS } from '../strings'
import type { AnswerValue, Mark, Question, Round, Submission } from '../types'

export default function RoundResults() {
  const { teamId, roundId } = useParams<{ teamId: string; roundId: string }>()
  const navigate = useNavigate()
  const { player, team } = usePlayer()

  const [round, setRound] = useState<Round | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [submissions, setSubmissions] = useState<Record<string, AnswerValue>>({})
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!player || !team || team.id !== teamId) {
      navigate('/join', { replace: true })
    }
  }, [player, team, teamId])

  useEffect(() => {
    if (!roundId || !teamId) return
    setLoading(true)

    Promise.all([
      supabase.from('rounds').select('*').eq('id', roundId).single(),
      supabase.from('questions').select('*').eq('round_id', roundId).order('order'),
      supabase.from('submissions').select('*').eq('team_id', teamId),
      supabase.from('marks').select('*').eq('team_id', teamId),
    ]).then(([rRes, qRes, subRes, markRes]) => {
      if (rRes.data) {
        setRound(rRes.data)
        if (rRes.data.lifecycle_state !== 'revealed') {
          navigate(`/team/${teamId}`)
        }
      }
      if (qRes.data) setQuestions(qRes.data)
      if (subRes.data) {
        const map: Record<string, AnswerValue> = {}
        for (const s of subRes.data as Submission[]) map[s.question_id] = s.value_json
        setSubmissions(map)
      }
      if (markRes.data) {
        const map: Record<string, Mark> = {}
        for (const m of markRes.data as Mark[]) map[m.question_id] = m
        setMarks(map)
      }
    }).finally(() => setLoading(false))
  }, [roundId, teamId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-ocean-400">{STRINGS.roundResults.loading}</div>
  )
  if (!round) return null

  const totalPoints = Object.values(marks).reduce((sum, m) => sum + m.points_awarded, 0)
  const roundQuestionIds = new Set(questions.map(q => q.id))
  const roundMarks = Object.entries(marks).filter(([id]) => roundQuestionIds.has(id))
  const roundTotal = roundMarks.reduce((sum, [, m]) => sum + m.points_awarded, 0)

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto">
      <header className="px-5 pt-6 pb-4">
        <button
          className="text-ocean-400 text-sm mb-2"
          onClick={() => navigate(`/team/${teamId}`)}
        >
          {STRINGS.roundResults.backButton}
        </button>
        <h1 className="font-heading text-2xl font-bold text-ocean-50">{round.title}</h1>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-ocean-300 text-sm">{STRINGS.roundResults.totalLabel}:</span>
          <span className="font-heading font-bold text-ocean-400 text-xl">{roundTotal}</span>
        </div>
      </header>

      <div className="flex-1 px-5 pb-8 space-y-6 overflow-y-auto">
        {questions.map(q => {
          const sub = submissions[q.id] ?? {}
          const mark = marks[q.id]
          const pts = q.points ?? round.points_per_correct

          return (
            <div key={q.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-ocean-400 text-xs mb-1">Q{q.order}</p>
                  {round.display_questions_in_app && q.prompt_text && (
                    <p className="font-medium text-ocean-100">{q.prompt_text}</p>
                  )}
                  {q.prompt_image_url && (
                    <img src={q.prompt_image_url} alt="" className="mt-2 rounded-xl max-h-40 object-contain" loading="lazy" />
                  )}
                </div>
                {mark && (
                  <div className="text-right shrink-0">
                    <span className={`font-heading font-bold text-xl ${
                      mark.points_awarded > 0 ? 'text-green-400' :
                      mark.points_awarded < 0 ? 'text-red-400' : 'text-ocean-400'
                    }`}>
                      {mark.points_awarded}/{pts}
                    </span>
                  </div>
                )}
              </div>

              {/* Submitted answer (read-only) */}
              <div>
                <p className="text-xs text-ocean-400 mb-1">{STRINGS.roundResults.yourAnswerLabel}</p>
                <QuestionInput
                  question={q}
                  value={sub}
                  onChange={() => {}}
                  disabled
                  showCorrect
                  correctAnswer={q.correct_answer_json}
                  pointsAwarded={mark?.points_awarded}
                  adminNote={mark?.admin_note ?? undefined}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
