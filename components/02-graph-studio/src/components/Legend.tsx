/**
 * Legend — Horizontal bar below graph canvas
 *
 * Source of truth: DESIGN-SPEC.md Section 4, Section 5
 * Categories as color dots + name, bridges as tier indicators.
 * Clicking a category toggles the categoryFilter in graph-store.
 */

import { useGraphStore } from '../stores/graph-store'
import { CATEGORY_COLORS, BRIDGE_COLORS } from '../constants/colors'

const BRIDGE_TIERS = [
  { key: 'gold', label: 'Gold', symbol: '\u25C9' },
  { key: 'silver', label: 'Silver', symbol: '\u25CE' },
  { key: 'bronze', label: 'Bronze', symbol: '\u25CB' },
] as const

export default function Legend() {
  const categoryFilter = useGraphStore(s => s.categoryFilter)
  const toggleCategory = useGraphStore(s => s.toggleCategory)
  const allNodes = useGraphStore(s => s.allNodes)

  // Only show categories that exist in data
  const activeCategories = new Map<string, number>()
  for (const node of allNodes) {
    if (node.__type === 'entity') {
      activeCategories.set(node.category, (activeCategories.get(node.category) || 0) + 1)
    }
  }

  const categories = Array.from(activeCategories.entries())
    .sort((a, b) => b[1] - a[1])

  return (
    <div
      className="flex items-center gap-3 px-4 py-1.5 flex-shrink-0 overflow-x-auto"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        scrollbarWidth: 'none',
      }}
    >
      {/* Category dots — single row, scrollable */}
      {categories.map(([cat]) => {
        const active = categoryFilter.has(cat)
        const color = CATEGORY_COLORS[cat] || '#6B7280'
        return (
          <button
            key={cat}
            onClick={() => toggleCategory(cat)}
            className="flex items-center gap-1 flex-shrink-0"
            title={active ? `Hide ${cat}` : `Show ${cat}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: active ? color : 'var(--text-muted)',
                opacity: active ? 1 : 0.3,
              }}
            />
            <span
              className="whitespace-nowrap"
              style={{
                color: active ? 'var(--text-secondary)' : 'var(--text-muted)',
                textDecoration: active ? 'none' : 'line-through',
                fontSize: '10px',
              }}
            >
              {cat}
            </span>
          </button>
        )
      })}

      {/* Separator */}
      <div className="w-px h-3 flex-shrink-0" style={{ background: 'var(--border)' }} />

      {/* Bridge tiers — inline */}
      {BRIDGE_TIERS.map(({ key, label, symbol }) => (
        <span key={key} className="flex items-center gap-0.5 flex-shrink-0" style={{ fontSize: '10px' }}>
          <span style={{ color: BRIDGE_COLORS[key] }}>{symbol}</span>
          <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        </span>
      ))}
    </div>
  )
}
