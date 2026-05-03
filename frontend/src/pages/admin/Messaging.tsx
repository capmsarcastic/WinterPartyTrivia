import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { adminApi } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import type { Message, Team } from '../../types'

type SendMode = 'broadcast' | 'team' | 'player'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

export default function Messaging() {
  const { showToast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [mode, setMode] = useState<SendMode>('broadcast')
  const [targetTeamId, setTargetTeamId] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  async function loadMessages() {
    const [msgs, ts] = await Promise.all([adminApi.getMessages(), adminApi.getTeams()])
    setMessages(msgs as Message[])
    setTeams((ts as Team[]).filter(t => t.status === 'approved'))
    setUnreadCount((msgs as Message[]).filter((m: Message) => !m.from_admin && !m.is_read).length)
  }

  useEffect(() => {
    loadMessages()
    const ch = supabase.channel('admin-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadMessages()
        showToast('New message received.', 'info')
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function send() {
    if (!body.trim()) return
    setSending(true)
    try {
      if (mode === 'broadcast') await adminApi.broadcast(body.trim())
      else if (mode === 'team' && targetTeamId) await adminApi.messageTeam(targetTeamId, body.trim())
      setBody('')
      showToast('Message sent!', 'success')
      loadMessages()
    } catch (err: unknown) {
      showToast((err as Error).message, 'error')
    } finally {
      setSending(false)
    }
  }

  async function markRead(id: string) {
    await adminApi.markRead(id).catch(() => {})
    loadMessages()
  }

  const playerMessages = messages.filter(m => m.target_type === 'admin')
  const sentMessages = messages.filter(m => m.from_admin)

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-6">
      <h1 className="font-heading text-2xl font-bold text-ocean-50 mt-2">Messages</h1>

      {/* Compose */}
      <div className="card space-y-4">
        <h2 className="font-heading font-bold text-ocean-200">Send a message</h2>

        <div className="flex gap-2">
          {(['broadcast', 'team'] as SendMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === m ? 'bg-ocean-400 text-ocean-900' : 'bg-ocean-700 text-ocean-300 hover:bg-ocean-600'
              }`}
            >
              {m === 'broadcast' ? '📢 Broadcast' : '👥 Team'}
            </button>
          ))}
        </div>

        {mode === 'team' && (
          <select className="input" value={targetTeamId} onChange={e => setTargetTeamId(e.target.value)}>
            <option value="">Select a team...</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        <textarea
          className="input resize-none"
          rows={3}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Type your message..."
        />

        <button
          className="btn-primary w-full"
          onClick={send}
          disabled={!body.trim() || sending || (mode === 'team' && !targetTeamId)}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Messages from players */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-bold text-ocean-200">
              From players
              {unreadCount > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{unreadCount}</span>
              )}
            </h2>
            <button className="btn-ghost btn-sm text-xs" onClick={loadMessages}>↻</button>
          </div>
          {playerMessages.length === 0 ? (
            <p className="text-ocean-500 text-sm">No messages from players.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {playerMessages.map(m => (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 ${m.is_read ? 'bg-ocean-700/40' : 'bg-ocean-600/50 border border-ocean-500/50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-ocean-400 font-medium">
                      {m.from_player_name || 'Unknown'} · {formatTime(m.sent_at)}
                    </p>
                    {!m.is_read && (
                      <button className="text-xs text-ocean-400 hover:text-ocean-200 shrink-0" onClick={() => markRead(m.id)}>
                        Mark read
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-ocean-100 mt-1">{m.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sent messages */}
        <div className="card">
          <h2 className="font-heading font-bold text-ocean-200 mb-3">Sent</h2>
          {sentMessages.length === 0 ? (
            <p className="text-ocean-500 text-sm">No sent messages.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {sentMessages.slice(0, 20).map(m => (
                <div key={m.id} className="bg-ocean-700/40 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-ocean-400">
                      {m.target_type === 'broadcast' ? '📢 Broadcast' :
                       m.target_type === 'team' ? `👥 Team` : '👤 Player'}
                    </span>
                    <span className="text-xs text-ocean-500">· {formatTime(m.sent_at)}</span>
                  </div>
                  <p className="text-sm text-ocean-200">{m.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
