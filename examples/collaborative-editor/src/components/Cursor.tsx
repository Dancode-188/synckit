import { useState, useEffect, useRef } from 'react'

interface CursorProps {
  position: { x: number; y: number }
  color: string
  name: string
}

// Simple spring physics for smooth cursor movement
class Spring {
  private current: number
  private target: number
  private velocity: number
  private damping = 0.7
  private stiffness = 0.15

  constructor(initial = 0) {
    this.current = initial
    this.target = initial
    this.velocity = 0
  }

  setTarget(target: number) {
    this.target = target
  }

  update() {
    const force = (this.target - this.current) * this.stiffness
    this.velocity = (this.velocity + force) * this.damping
    this.current += this.velocity
    return this.current
  }

  isAtRest() {
    return Math.abs(this.velocity) < 0.01 && Math.abs(this.target - this.current) < 0.01
  }
}

export default function Cursor({ position, color, name }: CursorProps) {
  const [pos, setPos] = useState(position)
  const springXRef = useRef(new Spring(position.x))
  const springYRef = useRef(new Spring(position.y))

  useEffect(() => {
    springXRef.current.setTarget(position.x)
    springYRef.current.setTarget(position.y)

    let rafId: number

    function animate() {
      const x = springXRef.current.update()
      const y = springYRef.current.update()

      setPos({ x, y })

      if (!springXRef.current.isAtRest() || !springYRef.current.isAtRest()) {
        rafId = requestAnimationFrame(animate)
      }
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [position])

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate(-2px, -2px)',
        transition: 'opacity 0.2s'
      }}
    >
      {/* Cursor pointer */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
      >
        <path
          d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
          fill={color}
          stroke="white"
          strokeWidth="1"
        />
      </svg>

      {/* Name label */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 12,
          padding: '2px 6px',
          backgroundColor: color,
          color: 'white',
          fontSize: 11,
          fontWeight: 500,
          borderRadius: 4,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      >
        {name}
      </div>
    </div>
  )
}
