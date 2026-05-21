/**
 * LSB Section 7: Edge Type Filter
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (Section 7), Section 8
 * Checkbox per causalClassification. Default COLLAPSED.
 */

import { useGraphStore } from '../../stores/graph-store'
import { CAUSAL_COLORS, MENTIONED_IN_COLOR } from '../../constants/colors'
import CollapsibleSection from '../shared/CollapsibleSection'

export default function EdgeTypeFilter() {
  const edgeTypeFilter = useGraphStore(s => s.edgeTypeFilter)
  const toggleEdgeType = useGraphStore(s => s.toggleEdgeType)
  const selectAll = useGraphStore(s => s.selectAllEdgeTypes)
  const deselectAll = useGraphStore(s => s.deselectAllEdgeTypes)
  const allLinks = useGraphStore(s => s.allLinks)

  // Count edges per classification
  const typeCounts = new Map<string, number>()
  for (const link of allLinks) {
    if (link.causalClassification) {
      typeCounts.set(link.causalClassification, (typeCounts.get(link.causalClassification) || 0) + 1)
    }
  }

  // Sort by count descending
  const types = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])

  const allSelected = types.length > 0 && types.every(([type]) => edgeTypeFilter.has(type))

  return (
    <CollapsibleSection title="Edge Types" count={types.length} defaultOpen={false} id="lsb-edge-types">
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
        {types.map(([type, count]) => {
          const active = edgeTypeFilter.has(type)
          const color = CAUSAL_COLORS[type] || (type === 'MENTIONED_IN' ? MENTIONED_IN_COLOR : '#6B7280')
          return (
            <label key={type} className="flex items-center gap-2 cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggleEdgeType(type)}
                className="accent-blue-500"
              />
              <span
                className="w-2 h-0.5 flex-shrink-0"
                style={{ backgroundColor: active ? color : 'var(--text-muted)' }}
              />
              <span
                className="text-xs flex-1 truncate"
                style={{ color: active ? 'var(--text-secondary)' : 'var(--text-muted)' }}
              >
                {type}
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
