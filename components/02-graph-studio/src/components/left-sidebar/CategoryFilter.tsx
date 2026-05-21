/**
 * LSB Section 5: Category Filter
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (Section 5), Section 8
 * Checkbox + color dot per category. Synced with Legend on canvas.
 */

import { useGraphStore } from '../../stores/graph-store'
import { CATEGORY_COLORS } from '../../constants/colors'
import CollapsibleSection from '../shared/CollapsibleSection'

export default function CategoryFilter() {
  const categoryFilter = useGraphStore(s => s.categoryFilter)
  const toggleCategory = useGraphStore(s => s.toggleCategory)
  const selectAll = useGraphStore(s => s.selectAllCategories)
  const deselectAll = useGraphStore(s => s.deselectAllCategories)
  const allNodes = useGraphStore(s => s.allNodes)

  // Count entities per category (from allNodes, not filtered)
  const categoryCounts = new Map<string, number>()
  for (const node of allNodes) {
    if (node.__type === 'entity') {
      categoryCounts.set(node.category, (categoryCounts.get(node.category) || 0) + 1)
    }
  }

  // Sort by count descending
  const categories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])

  const allSelected = categories.length > 0 && categories.every(([cat]) => categoryFilter.has(cat))

  return (
    <CollapsibleSection title="Categories" count={categories.length} id="lsb-categories">
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
        {categories.map(([cat, count]) => {
          const active = categoryFilter.has(cat)
          const color = CATEGORY_COLORS[cat] || '#6B7280'
          return (
            <label key={cat} className="flex items-center gap-2 cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggleCategory(cat)}
                className="accent-blue-500"
              />
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: active ? color : 'var(--text-muted)' }}
              />
              <span
                className="text-xs flex-1 truncate"
                style={{
                  color: active ? 'var(--text-secondary)' : 'var(--text-muted)',
                  textDecoration: active ? 'none' : 'line-through',
                }}
              >
                {cat}
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
