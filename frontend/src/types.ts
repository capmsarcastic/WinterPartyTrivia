// ============================================================
// Shared TypeScript types matching the database schema
// ============================================================

export type TeamStatus = 'pending' | 'approved' | 'deleted'
export type PlayerStatus = 'active' | 'kicked' | 'left'
export type RoundState = 'draft' | 'open' | 'locked' | 'marked' | 'revealed'
export type InputType = 'multiple_choice' | 'free_text' | 'numeric'
export type MessageTarget = 'broadcast' | 'team' | 'player' | 'admin'
export type ActorType = 'admin' | 'player' | 'system'

export interface EventConfig {
  id: number
  team_creation_enabled: boolean
  branding_json: {
    appName?: string
    subtitle?: string
  }
  push_destination: {
    page: string
    data: Record<string, unknown>
    pushed_at: string
  } | null
  updated_at: string
}

export interface Team {
  id: string
  name: string
  image_id: string
  status: TeamStatus
  creator_name: string | null
  rejection_message: string | null
  created_at: string
  updated_at: string
  // Joined fields (from API)
  passcode?: string
  member_count?: number
  members?: Player[]
  total_score?: number
}

export interface Player {
  id: string
  display_name: string
  team_id: string | null
  device_id: string
  status: PlayerStatus
  joined_at: string
  last_seen_at: string
}

export interface Round {
  id: string
  order: number
  title: string
  description: string | null
  points_per_correct: number
  lifecycle_state: RoundState
  display_questions_in_app: boolean
  created_at: string
  updated_at: string
  question_count?: number
}

export interface MultipleChoiceConfig {
  options: string[]
  allow_multiple_selections: boolean
}

export interface NumericConfig {
  min?: number
  max?: number
  decimal_places: number
  unit_label?: string
  scoring_mode: 'exact' | 'closest_wins'
  show_live_average?: boolean
}

export interface FreeTextConfig {
  case_sensitive: boolean
}

export interface Question {
  id: string
  round_id: string
  order: number
  prompt_text: string | null
  prompt_image_url: string | null
  input_type: InputType
  input_config_json: MultipleChoiceConfig | NumericConfig | FreeTextConfig | Record<string, unknown>
  correct_answer_json: unknown
  marking_notes: string | null
  points: number | null
  multi_input: boolean
  created_at: string
  updated_at: string
}

export interface Draft {
  team_id: string
  question_id: string
  value_json: AnswerValue
  last_editor_player_id: string | null
  last_editor_name: string | null
  updated_at: string
}

export interface Submission {
  team_id: string
  question_id: string
  value_json: AnswerValue
  submitted_at: string
  auto_submitted: boolean
}

export interface Mark {
  team_id: string
  question_id: string
  points_awarded: number
  admin_note: string | null
  marked_at: string
}

export interface ScoreEvent {
  id: string
  team_id: string
  points: number
  note: string
  category: string
  round_id: string | null
  awarded_at: string
  teams?: { name: string }
}

export interface Message {
  id: string
  from_admin: boolean
  from_player_id: string | null
  from_player_name: string | null
  target_type: MessageTarget
  target_id: string | null
  body: string
  sent_at: string
  is_read: boolean
}

export interface ActivityLogEntry {
  id: string
  event_type: string
  actor_type: ActorType
  actor_id: string | null
  actor_name: string | null
  payload_json: Record<string, unknown>
  created_at: string
}

export interface ImagePreset {
  id: string
  emoji: string
  category: string
  display_name: string
  is_active: boolean
}

// Answer value shapes per input type
export interface MultipleChoiceAnswer {
  selected?: string | string[]
}

export interface FreeTextAnswer {
  text?: string
}

export interface NumericAnswer {
  value?: number | string
}

export type AnswerValue = MultipleChoiceAnswer | FreeTextAnswer | NumericAnswer | Record<string, unknown>

// Frontend session state
export interface PlayerSession {
  player: Player
  team: Team
}
