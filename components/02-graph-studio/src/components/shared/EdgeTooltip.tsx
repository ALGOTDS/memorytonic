/**
 * EdgeTooltip — Floating tooltip for edge hover
 *
 * Source of truth: DESIGN-SPEC.md Section 10 (Edge Hover Tooltip)
 * Shows relType, causalClassification color, description, evidenceStrength badge.
 * Positioned via graph2ScreenCoords from GraphCanvas.
 */

import { CAUSAL_COLORS, EVIDENCE_COLORS } from '../../constants/colors'

export interface EdgeTooltipData {
  x: number
  y: number
  relType: string
  causalClassification: string
  description: string
  evidenceStrength: string
  magnitude: string
  sourceName: string
  targetName: string
}

interface Props {
  data: EdgeTooltipData
}

const EVIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  established: { label: 'Established', color: EVIDENCE_COLORS['established'] ?? '#6B7280' },
  claimed: { label: 'Claimed', color: EVIDENCE_COLORS['claimed'] ?? '#6B7280' },
  disputed: { label: 'Disputed', color: EVIDENCE_COLORS['disputed'] ?? '#6B7280' },
  speculative: { label: 'Speculative', color: EVIDENCE_COLORS['speculative'] ?? '#6B7280' },
}

export default function EdgeTooltip({ data }: Props) {
  const causalColor = CAUSAL_COLORS[data.causalClassification] || '#6B7280'
  const evidence = EVIDENCE_LABELS[data.evidenceStrength] || { label: data.evidenceStrength, color: '#6B7280' }

  // Clamp tooltip position to viewport
  const tooltipWidth = 280
  const tooltipHeight = 120 // approximate
  const margin = 10
  let left = data.x + margin
  let top = data.y - margin - tooltipHeight

  // Clamp right edge
  if (left + tooltipWidth > window.innerWidth - margin) {
    left = data.x - tooltipWidth - margin
  }
  // Clamp top edge
  if (top < margin) {
    top = data.y + margin
  }
  // Clamp left edge
  if (left < margin) {
    left = margin
  }

  return (
    <div
      className="absolute z-50 pointer-events-none rounded px-3 py-2"
      style={{
        left,
        top,
        background: 'rgba(20, 20, 32, 0.95)',
        border: `1px solid ${causalColor}44`,
        backdropFilter: 'blur(8px)',
        maxWidth: tooltipWidth,
      }}
    >
      {/* Source → Target */}
      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--text-primary)' }}>{data.sourceName}</span>
        {' → '}
        <span style={{ color: 'var(--text-primary)' }}>{data.targetName}</span>
      </div>

      {/* relType + classification */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          {data.relType}
        </span>
        <span
          className="text-xs px-1 rounded"
          style={{ color: causalColor, fontSize: '10px', border: `1px solid ${causalColor}44` }}
        >
          {data.causalClassification}
        </span>
      </div>

      {/* Description */}
      {data.description && (
        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
          {data.description}
        </p>
      )}

      {/* Badges row */}
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: evidence.color, fontSize: '10px' }}>
          {evidence.label}
        </span>
        {data.magnitude && (
          <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            {data.magnitude}
          </span>
        )}
      </div>
    </div>
  )
}
