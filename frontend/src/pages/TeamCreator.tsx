import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { playerApi } from '../lib/api'
import { useDeviceId } from '../hooks/useDeviceId'
import { useToast } from '../contexts/ToastContext'
import { ImagePicker } from '../components/ImagePicker'
import { STRINGS } from '../strings'
import { supabase } from '../lib/supabase'

type NameStatus = 'idle' | 'checking' | 'available' | 'taken'

export default function TeamCreator() {
  const navigate = useNavigate()
  const deviceId = useDeviceId()
  const { showToast } = useToast()

  const [name, setName] = useState('')
  const [imageId, setImageId] = useState('whale')
  const [passcode, setPasscode] = useState('')
  const [creatorName, setCreatorName] = useState('')
  const [nameStatus, setNameStatus] = useState<NameStatus>('idle')
  const [loading, setLoading] = useState(false)
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Real-time name uniqueness check
  useEffect(() => {
    if (!name.trim()) { setNameStatus('idle'); return }
    if (checkTimer.current) clearTimeout(checkTimer.current)
    setNameStatus('checking')
    checkTimer.current = setTimeout(async () => {
      const res = await supabase
        .from('teams')
        .select('id')
        .in('status', ['pending', 'approved'])
        .ilike('name', name.trim())
      setNameStatus(!res.data || res.data.length === 0 ? 'available' : 'taken')
    }, 400)
  }, [name])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (nameStatus === 'taken' || nameStatus === 'checking') return
    setLoading(true)
    try {
      const res = await playerApi.createTeam(deviceId, name.trim(), imageId, passcode, creatorName.trim()) as { team: import('../types').Team }
      navigate('/join/pending', { state: { team: res.team, creatorName: creatorName.trim() } })
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
    creatorName.trim() &&
    !loading

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-6 pb-4">
        <button onClick={() => navigate('/join')} className="text-ocean-400 text-sm mb-3">← Back</button>
        <h1 className="font-heading text-2xl font-bold text-ocean-50">{STRINGS.teamCreator.heading}</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex-1 px-5 pb-8 space-y-5 overflow-y-auto">
        {/* Creator name */}
        <div>
          <label className="label">{STRINGS.teamCreator.yourNameLabel}</label>
          <input
            className="input"
            value={creatorName}
            onChange={e => setCreatorName(e.target.value)}
            placeholder={STRINGS.teamCreator.yourNamePlaceholder}
            maxLength={30}
          />
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
             ' '}
          </p>
        </div>

        {/* Image picker */}
        <div>
          <label className="label">{STRINGS.teamCreator.imageLabel}</label>
          <ImagePicker value={imageId} onChange={setImageId} />
        </div>

        {/* Passcode */}
        <div>
          <label className="label">{STRINGS.teamCreator.passcodeLabel}</label>
          <input
            className="input tracking-widest text-center text-2xl max-w-32"
            value={passcode}
            onChange={e => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={STRINGS.teamCreator.passcodePlaceholder}
            type="password"
            inputMode="numeric"
            maxLength={4}
          />
        </div>

        <button type="submit" className="btn-primary w-full mt-2" disabled={!canSubmit}>
          {loading ? 'Submitting...' : STRINGS.teamCreator.submitButton}
        </button>
      </form>
    </div>
  )
}
