import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PlayerProvider } from './contexts/PlayerContext'
import { ToastProvider } from './contexts/ToastContext'
import { ToastContainer } from './components/Toast'
import { ReconnectBanner } from './components/ReconnectBanner'
import { usePushNavigation } from './hooks/usePushNavigation'

// Player pages
import Splash from './pages/Splash'
import Join from './pages/Join'
import TeamCreator from './pages/TeamCreator'
import PendingApproval from './pages/PendingApproval'
import RejectionNotice from './pages/RejectionNotice'
import TeamLobby from './pages/TeamLobby'
import RoundAnswer from './pages/RoundAnswer'
import RoundResults from './pages/RoundResults'

// Admin pages
import AdminLogin from './pages/admin/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import PendingTeams from './pages/admin/PendingTeams'
import TeamManagement from './pages/admin/TeamManagement'
import RoundManagement from './pages/admin/RoundManagement'
import MarkingGrid from './pages/admin/MarkingGrid'
import Leaderboard from './pages/admin/Leaderboard'
import Messaging from './pages/admin/Messaging'
import ActivityLog from './pages/admin/ActivityLog'

// Inner component so hooks run inside BrowserRouter + providers
function AppRoutes() {
  usePushNavigation()
  return (
    <>
      <ReconnectBanner />
      <ToastContainer />
      <Routes>
        {/* Player flow */}
        <Route path="/" element={<Splash />} />
        <Route path="/join" element={<Join />} />
        <Route path="/join/create" element={<TeamCreator />} />
        <Route path="/join/pending" element={<PendingApproval />} />
        <Route path="/join/rejected" element={<RejectionNotice />} />
        <Route path="/team/:teamId" element={<TeamLobby />} />
        <Route path="/team/:teamId/round/:roundId" element={<RoundAnswer />} />
        <Route path="/team/:teamId/round/:roundId/results" element={<RoundResults />} />

        {/* Admin — login sits outside the layout so it renders without the sidebar */}
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pending" element={<PendingTeams />} />
          <Route path="teams" element={<TeamManagement />} />
          <Route path="rounds" element={<RoundManagement />} />
          <Route path="rounds/:roundId/marking" element={<MarkingGrid />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="messages" element={<Messaging />} />
          <Route path="activity" element={<ActivityLog />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <PlayerProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </PlayerProvider>
    </ToastProvider>
  )
}
