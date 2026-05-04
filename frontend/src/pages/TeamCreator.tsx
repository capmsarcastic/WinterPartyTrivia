import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { playerApi } from '../lib/api'
import { useDeviceId } from '../hooks/useDeviceId'
import { useToast } from '../contexts/ToastContext'
import { ImagePicker } from '../components/ImagePicker'
import { STRINGS } from '../strings'
import { supabase } from '../lib/supabase'
import { getStoredPlayerName } from './Splash'

type NameStatus = 'idle' | 'checking' | 'available' | 'taken'

function normalizeTeamName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default function TeamCreator() {
  const navigate = useNavigate()
  const deviceId = useDeviceId()
  const { showToast } = useToast()

  const [name, setName] = useState('')
  const [imageId, setImageId] = useState('whale')
  const [passcode, setPasscode] = useState('')
  const [nameStatus, setNameStatus] = useState<NameStatus>('idle')
  const [loading, setLoading] = useState(false)
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const creatorName = getStoredPlayerName()

  // Real-time name uniqueness check — normalises to letters+numbers only
  useEffect(() => {
    const normalized = normalizeTeamName(name.trim())
    if (!normalized) { setNameStatus('idle'); return }
    if (checkTimer.current) clearTimeout(checkTimer.current)
    setNameStatus('checking')
    checkTimer.current = setTimeout(async () => {
      const res = await supabase
        .from('teams')
        .select('id, name')
        .in('status', ['pending', 'approved'])
      const taken = (res.data || []).some(
        t => normalizeTeamName(t.name) === normalized
      )
      setNameStatus(taken ? 'taken' : 'available')
    }, 400)
    return () => { if (checkTimer.current) clearTimeout(checkTimer.current) }
  }, [name])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (nameStatus === 'taken' || nameStatus === 'checking') return
    if (!creatorName) {
      showToast('Go back to the start and set your name first.', 'error')
      return
    }
    setLoading(true)
    try {
      const res = await playerApi.createTeam(deviceId, name.trim(), imageId, passcode, creatorName) as { team: import('../types').Team }
      navigate('/join/pending', { state: { team: res.team, passcode } })
    } catch (err: unknown) {
      showToast((err as Error).message || STRINGS.errors.generic, 'error')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    name.trim() &&
    nameStatus === 'available' &&
    passcode.length === 4 &&
    creatorName &&
    !loading

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-6 pb-4">
        <button onClick={() => navigate('/join')} className="text-ocean-400 text-sm mb-3">← Back</button>
        <h1 className="font-heading text-2xl font-bold text-ocean-50">{STRINGS.teamCreator.heading}</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex-1 px-5 pb-8 space-y-5 overflow-y-auto">
        {/* Creator name display */}
        <div className="bg-ocean-700/50 rounded-lg px-4 py-3 text-sm text-ocean-200">
          Creating as <span className="font-medium text-ocean-50">{creatorName || '(no name set)'}</span>
          {!creatorName && (
            <span className="ml-2 text-red-400">— go back to the start to set your name</span>
          )}
        </div>

        {/* Team name */}
        <div>
          <label className="label">{STRINGS.teamCreator.nameLabel}</label>
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={STRINGS.teamCreator.namePlaceholder}
            maxLength={40}
          />
          <p className={`text-xs mt-1 ${
            nameStatus === 'taken' ? 'text-red-400' :
            nameStatus === 'available' ? 'text-green-400' :
            'text-ocean-400'
          }`}>
            {nameStatus === 'checking' ? STRINGS.teamCreator.nameCheckingMessage :
             nameStatus === 'taken' ? STRINGS.teamCreator.nameTakenMessage :
             nameStatus === 'available' ? STRINGS.teamCreator.nameAvailableMessage :
             ' '}
          </p>
        </div>

        {/* Image picker */}
        <div>
          <label className="label">{STRINGS.teamCreator.imageLabel}</label>
          <ImagePicker value={imageId} onChange={setImageId} />
        </div>

        {/* Passcode — shown as plain text so creator can see and share it */}
        <div>
          <label className="label">{STRINGS.teamCreator.passcodeLabel}</label>
          <input
            className="input tracking-widest text-center text-2xl max-w-32 font-mono"
            value={passcode}
            onChange={e => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
            inputMode="numeric"
            maxLength={4}
          />
          <p className="text-xs mt-1 text-ocean-400">Share this code with your teammates so they can join.</p>
        </div>

        <button type="submit" className="btn-primary w-full mt-2" disabled={!canSubmit}>
          {loading ? 'Submitting...' : STRINGS.teamCreator.submitButton}
        </button>
      </form>
    </div>
  )
}
