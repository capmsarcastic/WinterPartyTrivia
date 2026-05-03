import { useLocation, useNavigate } from 'react-router-dom'
import { STRINGS } from '../strings'

export default function RejectionNotice() {
  const navigate = useNavigate()
  const location = useLocation()
  const message = location.state?.message as string | undefined

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="text-7xl mb-6">😬</div>
      <h1 className="font-heading text-2xl font-bold text-ocean-50 mb-3">
        {STRINGS.rejection.heading}
      </h1>
      {message && (
        <div className="card max-w-sm mb-8 text-ocean-200">
          <p className="text-sm">{message}</p>
        </div>
      )}
      <button
        className="btn-primary"
        onClick={() => navigate('/join', { replace: true })}
      >
        {STRINGS.rejection.backButton}
      </button>
    </div>
  )
}
