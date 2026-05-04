import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../lib/api'
import { useDeviceId } from '../../hooks/useDeviceId'
import { useToast } from '../../contexts/ToastContext'

export default function AdminLogin() {
  const navigate = useNavigate()
  const deviceId = useDeviceId()
  const { showToast } = useToast()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await adminApi.login(password, deviceId)
      navigate('/admin/dashboard', { replace: true })
    } catch (err: unknown) {
      showToast((err as Error).message || 'Login failed.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🎛️</div>
          <h1 className="font-heading text-2xl font-bold text-ocean-50">Admin</h1>
          <p className="text-ocean-400 text-sm mt-1">Winter Party Trivia control panel</p>
        </div>

        <form onSubmit={handleLogin} className="card space-y-4">
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoFocus
            />
          </div>
          <button className="btn-primary w-full" disabled={!password || loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center mt-6">
          <button className="text-ocean-500 text-sm hover:text-ocean-400" onClick={() => navigate('/')}>
            ← Back to the game
          </button>
        </p>
      </div>
    </div>
  )
}
