/**
 * LSB Section 6: Bridge Filter
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (Section 6), Section 8
 * Four tiers: Gold (3+), Silver (2), Bronze (high betweenness), None.
 */

import { useGraphStore } from '../../stores/graph-store'
import { BRIDGE_COLORS } from '../../constants/colors'
import CollapsibleSection from '../shared/CollapsibleSection'

const TIERS = [
  { key: 'gold', label: 'Gold (3+ projects)', symbol: '◉' },
  { key: 'silver', label: 'Silver (2 projects)', symbol: '◎' },
  { key: 'bronze', label: 'Bronze (high bridge)', symbol: '○' },
  { key: 'none', label: 'No bridge', symbol: '·' },
] as const

export default function BridgeFilter() {
  const bridgeFilter = useGraphStore(s => s.bridgeFilter)
  const toggleBridgeTier = useGraphStore(s => s.toggleBridgeTier)
  const selectAll = useGraphStore(s => s.selectAllBridgeTiers)
  const deselectAll = useGraphStore(s => s.deselectAllBridgeTiers)
  const allNodes = useGraphStore(s => s.allNodes)

  // Count per tier
  const tierCounts = new Map<string, number>()
  for (const node of allNodes) {
    if (node.__type === 'entity') {
      tierCounts.set(node.__bridgeTier, (tierCounts.get(node.__bridgeTier) || 0) + 1)
    }
  }

  const allSelected = bridgeFilter.size === TIERS.length

  return (
    <CollapsibleSection title="Bridges" id="lsb-bridges">
      {/* Bulk toggle */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={allSelected ? deselectAll : selectAll}
          className="text-xs"
          style={{ color: 'var(--accent)' }}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="space-y-1">
        {TIERS.map(({ key, label, symbol }) => {
          const active = bridgeFilter.has(key)
          const color = BRIDGE_COLORS[key] || 'var(--text-muted)'
          const count = tierCounts.get(key) || 0
          return (
            <label key={key} className="flex items-center gap-2 cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggleBridgeTier(key)}
                className="accent-blue-500"
              />
              <span style={{ color: key === 'none' ? 'var(--text-muted)' : color }}>
                {symbol}
              </span>
              <span
                className="text-xs flex-1"
                style={{ color: active ? 'var(--text-secondary)' : 'var(--text-muted)' }}
              >
                {label}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {count}
              </span>
            </label>
          )
        })}
      </div>
    </CollapsibleSection>
  )
}
