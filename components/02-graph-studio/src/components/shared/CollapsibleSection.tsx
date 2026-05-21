/**
 * CollapsibleSection — Reusable section wrapper for LSB
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (LSB Layout)
 */

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useGraphStore } from '../../stores/graph-store'

interface Props {
  title: string
  defaultOpen?: boolean   // false = collapsed on load (user can still expand)
  count?: number
  id?: string
  children: ReactNode
}

export default function CollapsibleSection({
  title,
  defaultOpen = false,
  count,
  id,
  children,
}: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const sectionRef = useRef<HTMLDivElement>(null)
  const lsbScrollTarget = useGraphStore(s => s.lsbScrollTarget)
  const clearLsbScrollTarget = useGraphStore(s => s.clearLsbScrollTarget)

  // Auto-open and scroll when targeted by right-click navigation
  useEffect(() => {
    if (lsbScrollTarget && lsbScrollTarget === id) {
      setIsOpen(true)
      // Small delay so content renders before scroll
      requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      clearLsbScrollTarget()
    }
  }, [lsbScrollTarget, id, clearLsbScrollTarget])

  return (
    <div ref={sectionRef} id={id} style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium"
        style={{
          color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: isOpen ? 'var(--accent-dim)' : 'transparent',
        }}
      >
        <span className="flex items-center gap-1.5">
          <span style={{
            color: 'var(--text-muted)',
            fontSize: '8px',
            transition: 'transform 0.15s ease',
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}>
            &#9654;
          </span>
          {title}
        </span>
        {count !== undefined && (
          <span
            className="px-1.5 py-0.5 rounded-full"
            style={{ color: 'var(--text-muted)', background: 'var(--surface-hover)', fontSize: '10px' }}
          >
            {count}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}
