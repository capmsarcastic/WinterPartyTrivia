import { useToast } from '../contexts/ToastContext'

const colours = {
  info:    'bg-ocean-600 border-ocean-400 text-ocean-50',
  success: 'bg-green-800 border-green-500 text-green-100',
  error:   'bg-red-800 border-red-500 text-red-100',
  warning: 'bg-amber-800 border-amber-500 text-amber-100',
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToast()

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-xl
            animate-slide-up pointer-events-auto ${colours[toast.type]}`}
        >
          <span className="flex-1 text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => dismissToast(toast.id)}
            className="shrink-0 text-current opacity-60 hover:opacity-100 text-lg leading-none mt-0.5"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
