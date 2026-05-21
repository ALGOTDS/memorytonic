/**
 * LSB Section 3: Importance Bandwidth Slider
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (Section 3), Section 8
 * Dual-thumb range slider for composite importance percentile (0-100).
 * Both thumbs on one track — user drags min or max independently.
 * Project nodes are exempt from this filter.
 */

import { useCallback, useRef } from 'react'
import { useGraphStore } from '../../stores/graph-store'
import CollapsibleSection from '../shared/CollapsibleSection'

export default function ImportanceSlider() {
  const bandwidthRange = useGraphStore(s => s.bandwidthRange)
  const setBandwidthRange = useGraphStore(s => s.setBandwidthRange)
  const filteredCount = useGraphStore(s => s.filteredNodes.filter(n => n.__type === 'entity').length)
  const totalCount = useGraphStore(s => s.allNodes.filter(n => n.__type === 'entity').length)

  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'min' | 'max' | null>(null)

  const [min, max] = bandwidthRange

  // Convert pixel position to 0-100 value
  const posToValue = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * 100)
  }, [])

  const handlePointerDown = useCallback((thumb: 'min' | 'max') => (e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = thumb
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const val = posToValue(e.clientX)
    if (dragging.current === 'min') {
      if (val <= max) setBandwidthRange([val, max])
    } else {
      if (val >= min) setBandwidthRange([min, val])
    }
  }, [min, max, posToValue, setBandwidthRange])

  const handlePointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  // Click on track to jump nearest thumb
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    const val = posToValue(e.clientX)
    const distToMin = Math.abs(val - min)
    const distToMax = Math.abs(val - max)
    if (distToMin <= distToMax) {
      if (val <= max) setBandwidthRange([val, max])
    } else {
      if (val >= min) setBandwidthRange([min, val])
    }
  }, [min, max, posToValue, setBandwidthRange])

  return (
    <CollapsibleSection title="Importance" id="lsb-importance">
      <div className="space-y-2">
        {/* Range labels */}
        <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>{min}</span>
          <span>{max}</span>
        </div>

        {/* Dual-thumb slider track */}
        <div
          ref={trackRef}
          className="relative h-5 cursor-pointer"
          onClick={handleTrackClick}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Background track */}
          <div
            className="absolute top-1/2 left-0 right-0 -translate-y-1/2 rounded-full"
            style={{ height: 4, background: 'var(--border)' }}
          />

          {/* Active range fill */}
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              height: 4,
              left: `${min}%`,
              width: `${max - min}%`,
              background: 'var(--accent)',
              opacity: 0.6,
            }}
          />

          {/* Min thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full cursor-grab active:cursor-grabbing"
            style={{
              left: `${min}%`,
              width: 14,
              height: 14,
              background: 'var(--accent)',
              border: '2px solid var(--surface)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              zIndex: min === max ? 2 : 1,
            }}
            onPointerDown={handlePointerDown('min')}
          />

          {/* Max thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full cursor-grab active:cursor-grabbing"
            style={{
              left: `${max}%`,
              width: 14,
              height: 14,
              background: 'var(--accent)',
              border: '2px solid var(--surface)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              zIndex: 1,
            }}
            onPointerDown={handlePointerDown('max')}
          />
        </div>

        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Showing: {filteredCount} / {totalCount} entities
        </div>
      </div>
    </CollapsibleSection>
  )
}
