import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePlayer } from '../contexts/PlayerContext'
import type { EventConfig } from '../types'

/**
 * Subscribes to event_config changes and navigates players
 * when the admin pushes a new page destination.
 */
export function usePushNavigation() {
  const navigate = useNavigate()
  const { player, team } = usePlayer()
  const lastPushedAt = useRef<string | null>(null)

  useEffect(() => {
    // Players only — admin is excluded
    if (!player || !team) return

    const channel = supabase
      .channel('push-navigation')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'event_config', filter: 'id=eq.1' },
        (payload) => {
          const config = payload.new as EventConfig
          const dest = config.push_destination
          if (!dest) return
          if (dest.pushed_at === lastPushedAt.current) return
          lastPushedAt.current = dest.pushed_at

          switch (dest.page) {
            case 'team_lobby':
              navigate(`/team/${team.id}`)
              break
            case 'round_answer': {
              const roundId = (dest.data as { round_id?: string }).round_id
              if (roundId) navigate(`/team/${team.id}/round/${roundId}`)
              break
            }
            case 'round_results': {
              const roundId = (dest.data as { round_id?: string }).round_id
              if (roundId) navigate(`/team/${team.id}/round/${roundId}/results`)
              break
            }
            default:
              break
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [player, team, navigate])
}
