import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { adminApi } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import type { Message } from '../../types'

const NAV_ITEMS = [
  { path: '/admin/dashboard',  label: 'Dashboard',     icon: '🏠' },
  { path: '/admin/pending',    label: 'Pending teams', icon: '⏳' },
  { path: '/admin/teams',      label: 'Teams',         icon: '👥' },
  { path: '/admin/rounds',     label: 'Rounds',        icon: '📋' },
  { path: '/admin/leaderboard',label: 'Leaderboard',   icon: '🏆' },
  { path: '/admin/messages',   label: 'Messages',      icon: '💬' },
  { path: '/admin/activity',   label: 'Activity log',  icon: '📜' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [checking, setChecking] = useState(true)
  const [navOpen, setNavOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    adminApi.me().then(res => {
      if (!res.authenticated) navigate('/admin', { replace: true })
    }).catch(() => navigate('/admin', { replace: true }))
      .finally(() => setChecking(false))
  }, [])

  async function loadUnreadCount() {
    try {
      const msgs = await adminApi.getMessages() as Message[]
      setUnreadCount(msgs.filter(m => !m.from_admin && !m.is_read).length)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadUnreadCount()
    const ch = supabase.channel('admin-layout-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadUnreadCount()
        showToast('New message from a player 💬', 'info')
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, loadUnreadCount)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function handleLogout() {
    await adminApi.logout().catch(() => {})
    navigate('/admin', { replace: true })
  }

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center text-ocean-400">Checking session...</div>
  )

  function NavItem({ item, onClick }: { item: typeof NAV_ITEMS[0]; onClick?: () => void }) {
    const isMessages = item.path === '/admin/messages'
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onClick}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isActive
              ? 'bg-ocean-600 text-ocean-50 font-medium'
              : 'text-ocean-300 hover:bg-ocean-700 hover:text-ocean-100'
          }`
        }
      >
        <span>{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        {isMessages && unreadCount > 0 && (
          <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-bold">
            {unreadCount}
          </span>
        )}
      </NavLink>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 bg-ocean-800 border-r border-ocean-700 shrink-0">
        <div className="px-4 py-5 border-b border-ocean-700">
          <p className="font-heading font-bold text-ocean-100 text-lg">🎛️ Admin</p>
          <p className="text-ocean-400 text-xs mt-0.5">Winter Party Trivia</p>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {NAV_ITEMS.map(item => (
            <NavItem key={item.path} item={item} />
          ))}
        </nav>
        <div className="p-3 border-t border-ocean-700">
          <button onClick={handleLogout} className="btn-ghost btn-sm w-full text-red-400 hover:text-red-300">
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-ocean-800 border-b border-ocean-700 px-4 py-3 flex items-center justify-between">
        <p className="font-heading font-bold text-ocean-100">🎛️ Admin</p>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-bold">
              {unreadCount} msg
            </span>
          )}
          <button onClick={() => setNavOpen(v => !v)} className="text-ocean-300 text-2xl leading-none">☰</button>
        </div>
      </div>

      {navOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/70" onClick={() => setNavOpen(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-56 bg-ocean-800 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-4 border-b border-ocean-700 flex justify-between items-center">
              <p className="font-heading font-bold text-ocean-100">Navigation</p>
              <button onClick={() => setNavOpen(false)} className="text-ocean-400 text-xl">✕</button>
            </div>
            <nav className="flex-1 py-3 space-y-0.5 px-2">
              {NAV_ITEMS.map(item => (
                <NavItem key={item.path} item={item} onClick={() => setNavOpen(false)} />
              ))}
            </nav>
            <div className="p-3 border-t border-ocean-700">
              <button onClick={handleLogout} className="btn-ghost btn-sm w-full text-red-400">Sign out</button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:overflow-y-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  )
}
