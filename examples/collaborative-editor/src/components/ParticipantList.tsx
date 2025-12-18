import { usePresence, useOthers, useSelf } from '@synckit-js/sdk/react'
import { useStore } from '../store'
import { useEffect, useMemo, useRef } from 'react'

export default function ParticipantList() {
  const { activeDocumentId } = useStore()

  // Create initial presence state only once to avoid infinite re-renders
  const initialPresence = useMemo(() => ({
    name: 'Anonymous',
    color: '#' + Math.floor(Math.random()*16777215).toString(16),
    lastSeen: Date.now()
  }), [])

  const [presence, setPresence] = usePresence(activeDocumentId || 'default', initialPresence)
  const others = useOthers(activeDocumentId || 'default')
  const self = useSelf(activeDocumentId || 'default')

  // Use ref to track latest presence without causing re-renders
  const presenceRef = useRef(presence)
  useEffect(() => {
    presenceRef.current = presence
  }, [presence])

  // Update lastSeen timestamp periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const current = presenceRef.current
      if (current) {
        setPresence({
          ...current,
          lastSeen: Date.now()
        })
      }
    }, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [setPresence])

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Combine self and others
  const allParticipants = self ? [self, ...others] : others

  // Filter out stale participants (not seen in last 30 seconds)
  const activeParticipants = allParticipants.filter(
    (p) => p.state.lastSeen && Date.now() - (p.state.lastSeen as number) < 30000
  )

  if (activeParticipants.length === 0) {
    return null
  }

  return (
    <div className="participant-list">
      <div className="participant-list-title">
        Active Users ({activeParticipants.length})
      </div>
      {activeParticipants.map((participant) => (
        <div key={participant.client_id} className="participant-item">
          <div
            className="participant-avatar"
            style={{ backgroundColor: (participant.state.color as string) || '#888' }}
          >
            {getInitials((participant.state.name as string) || 'A')}
          </div>
          <span className="participant-name">
            {(participant.state.name as string) || 'Anonymous'}
            {participant.client_id === self?.client_id && ' (You)'}
          </span>
        </div>
      ))}
    </div>
  )
}
