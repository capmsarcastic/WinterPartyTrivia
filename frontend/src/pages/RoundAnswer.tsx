import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { playerApi } from '../lib/api'
import { usePlayer } from '../contexts/PlayerContext'
import { useDeviceId } from '../hooks/useDeviceId'
import { QuestionInput } from '../components/QuestionInput'
import { STRINGS } from '../strings'
import type { AnswerValue, Draft, Question, Round } from '../types'

export default function RoundAnswer() {
  const { teamId, roundId } = useParams<{ teamId: string; roundId: string }>()
  const navigate = useNavigate()
  const deviceId = useDeviceId()
  const { player, team } = usePlayer()

  const [round, setRound] = useState<Round | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [drafts, setDrafts] = useState<Record<string, AnswerValue>>({})
  const [lastEditors, setLastEditors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    if (!player || !team || team.id !== teamId) {
      navigate('/join', { replace: true })
    }
  }, [player, team, teamId])

  async function loadData() {
    if (!roundId || !teamId) return

    const [rRes, qRes, dRes] = await Promise.all([
      supabase.from('rounds').select('*').eq('id', roundId).single(),
      supabase.from('questions').select('*').eq('round_id', roundId).order('order'),
      supabase.from('drafts').select('*').eq('team_id', teamId),
    ])

    if (rRes.data) {
      setRound(rRes.data)
      // If round is locked, redirect to lobby
      if (rRes.data.lifecycle_state === 'locked' || rRes.data.lifecycle_state === 'marked') {
        navigate(`/team/${teamId}`)
      }
      // If revealed, go to results
      if (rRes.data.lifecycle_state === 'revealed') {
        navigate(`/team/${teamId}/round/${roundId}/results`)
      }
    }
    if (qRes.data) setQuestions(qRes.data)
    if (dRes.data) {
      const map: Record<string, AnswerValue> = {}
      const editors: Record<string, string> = {}
      for (const d of dRes.data as Draft[]) {
        map[d.question_id] = d.value_json
        if (d.last_editor_name) editors[d.question_id] = d.last_editor_name
      }
      setDrafts(map)
      setLastEditors(editors)
    }
  }

  useEffect(() => {
    loadData()

    const ch = supabase
      .channel(`round-answer-${roundId}-${teamId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `id=eq.${roundId}` },
        (payload) => {
          const r = payload.new as Round
          setRound(r)
          if (r.lifecycle_state === 'locked' || r.lifecycle_state === 'marked') {
            navigate(`/team/${teamId}`)
          }
          if (r.lifecycle_state === 'revealed') {
            navigate(`/team/${teamId}/round/${roundId}/results`)
          }
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'drafts',
          filter: `team_id=eq.${teamId}` },
        (payload) => {
          const d = payload.new as Draft
          // Only update if another player made the edit
          if (d.last_editor_player_id !== player?.id) {
            setDrafts(prev => ({ ...prev, [d.question_id]: d.value_json }))
            if (d.last_editor_name) {
              setLastEditors(prev => ({ ...prev, [d.question_id]: d.last_editor_name! }))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
      Object.values(debounceTimers.current).forEach(clearTimeout)
    }
  }, [roundId, teamId])

  const handleChange = useCallback((questionId: string, value: AnswerValue) => {
    if (!player || !team) return

    // Optimistic update
    setDrafts(prev => ({ ...prev, [questionId]: value }))
    setLastEditors(prev => ({ ...prev, [questionId]: player.display_name }))

    // Save to localStorage immediately
    try {
      localStorage.setItem(`wpt_draft_${teamId}_${questionId}`, JSON.stringify(value))
    } catch { /* ignore */ }

    // Debounce server save
    if (debounceTimers.current[questionId]) clearTimeout(debounceTimers.current[questionId])
    setSaving(prev => ({ ...prev, [questionId]: true }))
    debounceTimers.current[questionId] = setTimeout(async () => {
      try {
        await playerApi.updateDraft(deviceId, team.id, questionId, value, player.id, player.display_name)
      } catch { /* ignore — draft already in localStorage */ }
      setSaving(prev => ({ ...prev, [questionId]: false }))
    }, 300)
  }, [player, team, deviceId, teamId])

  const isLocked = round?.lifecycle_state !== 'open'

  if (!round || !player) return (
    <div className="min-h-screen flex items-center justify-center text-ocean-400">Loading...</div>
  )

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto">
      <header className="px-5 pt-6 pb-4 sticky top-0 bg-ocean-900/90 backdrop-blur z-10">
        <button onClick={() => navigate(`/team/${teamId}`)} className="text-ocean-400 text-sm mb-2">← Lobby</button>
        <h1 className="font-heading text-xl font-bold text-ocean-50">{round.title}</h1>
        {round.description && <p className="text-ocean-300 text-sm mt-1">{round.description}</p>}
        {isLocked && (
          <div className="mt-2 bg-yellow-900/50 border border-yellow-600/50 rounded-lg px-3 py-2 text-yellow-300 text-sm">
            {STRINGS.roundAnswer.lockedBanner}
          </div>
        )}
      </header>

      <div className="flex-1 px-5 pb-8 space-y-8 overflow-y-auto">
        {questions.map((q, i) => (
          <div key={q.id} className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-ocean-400 text-xs font-medium mb-1">Q{q.order}</p>
                {q.prompt_text && (q.input_config_json as { show_prompt_text?: boolean }).show_prompt_text !== false && (
                  <p className="text-ocean-100 font-medium">{q.prompt_text}</p>
                )}
                {q.prompt_image_url && (
                  <img src={q.prompt_image_url} alt={`Question ${q.order}`}
                    className="mt-2 rounded-xl max-h-48 object-contain" loading="lazy" />
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-ocean-400 text-xs">
                  {q.points ?? round.points_per_correct}pt
                </span>
                {saving[q.id] && <p className="text-ocean-600 text-xs mt-0.5">saving...</p>}
              </div>
            </div>

            <QuestionInput
              question={q}
              value={drafts[q.id] ?? {}}
              onChange={(v) => handleChange(q.id, v)}
              disabled={isLocked}
            />

            {lastEditors[q.id] && !isLocked && (
              <p className="text-xs text-ocean-500 italic">
                {STRINGS.roundAnswer.lastEdited(lastEditors[q.id])}
              </p>
            )}
          </div>
        ))}

        {!isLocked && (
          <p className="text-center text-ocean-600 text-xs">{STRINGS.roundAnswer.submitHint}</p>
        )}
      </div>
    </div>
  )
}
