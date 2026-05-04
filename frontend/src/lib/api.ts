// All writes and sensitive operations go through the FastAPI backend.
// The X-Device-ID header is sent with player requests.

const API_BASE = (import.meta.env.VITE_API_URL as string) || ''

async function request<T>(
  path: string,
  options: RequestInit = {},
  deviceId?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (deviceId) headers['X-Device-ID'] = deviceId

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Request failed.' }))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) }
}

function patch(body: unknown): RequestInit {
  return { method: 'PATCH', body: JSON.stringify(body) }
}

function put(body: unknown): RequestInit {
  return { method: 'PUT', body: JSON.stringify(body) }
}

function del(): RequestInit {
  return { method: 'DELETE' }
}

// ---- Player API ----

export const playerApi = {
  session: (deviceId: string) =>
    request<{ player: import('../types').Player | null }>('/api/player/session', {}, deviceId),

  joinTeam: (deviceId: string, teamId: string, displayName: string, passcode: string) =>
    request('/api/player/join-team', json({ team_id: teamId, display_name: displayName, passcode }), deviceId),

  createTeam: (deviceId: string, name: string, imageId: string, passcode: string, creatorName: string) =>
    request('/api/player/create-team', json({ name, image_id: imageId, passcode, creator_name: creatorName }), deviceId),

  cancelTeam: (deviceId: string, teamId: string) =>
    request('/api/player/cancel-team-creation', json({ team_id: teamId }), deviceId),

  updateDraft: (deviceId: string, teamId: string, questionId: string, valueJson: object, playerId: string, playerName: string) =>
    request('/api/player/draft', put({ team_id: teamId, question_id: questionId, value_json: valueJson, player_id: playerId, player_name: playerName }), deviceId),

  leaveTeam: (deviceId: string, playerId: string) =>
    request('/api/player/leave-team', json({ player_id: playerId }), deviceId),

  bootMember: (deviceId: string, teamId: string, bootingPlayerId: string, targetPlayerId: string) =>
    request('/api/player/boot-member', json({ team_id: teamId, booting_player_id: bootingPlayerId, target_player_id: targetPlayerId }), deviceId),

  sendMessage: (deviceId: string, fromPlayerId: string, fromPlayerName: string, body: string) =>
    request('/api/player/message', json({ from_player_id: fromPlayerId, from_player_name: fromPlayerName, body }), deviceId),

  heartbeat: (deviceId: string, playerId: string) =>
    request('/api/player/heartbeat', put({ player_id: playerId }), deviceId),

  getPasscode: (deviceId: string, playerId: string) =>
    request<{ passcode: string }>(`/api/player/team-passcode?player_id=${playerId}`, {}, deviceId),
}

// ---- Public API ----

export const publicApi = {
  eventConfig: () => request<import('../types').EventConfig>('/api/public/event-config'),
  teams: () => request<import('../types').Team[]>('/api/public/teams'),
  imagePresets: () => request<import('../types').ImagePreset[]>('/api/public/image-presets'),
  checkName: (name: string) =>
    request<{ available: boolean }>(`/api/public/check-name?name=${encodeURIComponent(name)}`),
  teamStatus: (teamId: string) =>
    request<{ status: string; rejection_message: string | null }>(`/api/public/team-status/${teamId}`),
}

// ---- Admin API ----

export const adminApi = {
  login: (password: string, deviceId: string) =>
    request('/api/admin/login', json({ password, device_id: deviceId })),

  logout: () => request('/api/admin/logout', json({})),

  me: () => request<{ authenticated: boolean }>('/api/admin/me'),

  getEventConfig: () => request('/api/admin/event-config'),
  updateEventConfig: (data: { team_creation_enabled?: boolean; branding_json?: object }) =>
    request('/api/admin/event-config', patch(data)),

  push: (page: string, data?: object) =>
    request('/api/admin/push', json({ page, data })),

  broadcast: (body: string) => request('/api/admin/broadcast', json({ body })),
  messageTeam: (teamId: string, body: string) =>
    request('/api/admin/message-team', json({ team_id: teamId, body })),
  messagePlayer: (targetPlayerId: string, body: string) =>
    request('/api/admin/message-player', json({ target_player_id: targetPlayerId, body })),
  getMessages: () => request('/api/admin/messages'),
  markRead: (messageId: string) =>
    request(`/api/admin/messages/${messageId}/read`, patch({})),

  getTeams: () => request<import('../types').Team[]>('/api/admin/teams'),
  approveTeam: (teamId: string) => request(`/api/admin/teams/${teamId}/approve`, json({})),
  rejectTeam: (teamId: string, message?: string) =>
    request(`/api/admin/teams/${teamId}/reject`, json({ message })),
  updateTeam: (teamId: string, data: object) =>
    request(`/api/admin/teams/${teamId}`, patch(data)),
  deleteTeam: (teamId: string) => request(`/api/admin/teams/${teamId}`, del()),
  bootPlayer: (teamId: string, playerId: string) =>
    request(`/api/admin/teams/${teamId}/boot-player/${playerId}`, json({})),
  renamePlayer: (teamId: string, playerId: string, newName: string) =>
    request(`/api/admin/teams/${teamId}/rename-player`, patch({ player_id: playerId, new_name: newName })),

  getRounds: () => request<import('../types').Round[]>('/api/admin/rounds'),
  createRound: (data: object) => request('/api/admin/rounds', json(data)),
  updateRound: (roundId: string, data: object) =>
    request(`/api/admin/rounds/${roundId}`, patch(data)),
  deleteRound: (roundId: string) => request(`/api/admin/rounds/${roundId}`, del()),
  advanceRound: (roundId: string) =>
    request(`/api/admin/rounds/${roundId}/advance-state`, json({})),
  revertRound: (roundId: string) =>
    request(`/api/admin/rounds/${roundId}/revert-state`, json({})),

  getQuestions: (roundId: string) =>
    request<import('../types').Question[]>(`/api/admin/rounds/${roundId}/questions`),
  createQuestion: (roundId: string, data: object) =>
    request(`/api/admin/rounds/${roundId}/questions`, json(data)),
  updateQuestion: (questionId: string, data: object) =>
    request(`/api/admin/questions/${questionId}`, patch(data)),
  deleteQuestion: (questionId: string) =>
    request(`/api/admin/questions/${questionId}`, del()),
  csvImport: (roundId: string, csvText: string) =>
    request(`/api/admin/rounds/${roundId}/csv-import`, {
      method: 'POST',
      body: csvText,
      headers: { 'Content-Type': 'text/plain' },
    }),

  getSubmissions: (roundId: string) =>
    request(`/api/admin/rounds/${roundId}/submissions`),
  updateMarks: (marks: object[]) =>
    request('/api/admin/marks', put({ marks })),
  commitScores: (roundId: string) =>
    request(`/api/admin/rounds/${roundId}/commit-scores`, json({})),
  finaliseScores: (roundId: string) =>
    request(`/api/admin/rounds/${roundId}/finalise-scores`, json({})),

  getScoreEvents: () => request('/api/admin/score-events'),
  createScoreEvent: (data: object) => request('/api/admin/score-events', json(data)),
  deleteScoreEvent: (id: string) => request(`/api/admin/score-events/${id}`, del()),

  getLeaderboard: () => request('/api/admin/leaderboard'),
  getActivityLog: (limit?: number) =>
    request(`/api/admin/activity-log${limit ? `?limit=${limit}` : ''}`),
}
