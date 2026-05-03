import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { STRINGS } from '../strings'

export function ReconnectBanner() {
  const [status, setStatus] = useState<'connected' | 'reconnecting'>('connected')

  useEffect(() => {
    const channel = supabase.channel('connection-monitor')
    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED') setStatus('connected')
      else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') setStatus('reconnecting')
    })

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (status === 'connected') return null

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-amber-600 text-amber-50 text-center text-sm py-1.5 font-medium animate-pulse">
      {STRINGS.reconnecting}
    </div>
  )
}
