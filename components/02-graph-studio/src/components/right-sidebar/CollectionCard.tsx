/**
 * CollectionCard — Collection overview with stats, bridges, top entities
 *
 * Source of truth: DESIGN-SPEC.md Section 6 (Collection Card)
 * Displayed when clicking collection header in LSB.
 */

import { useGraphStore } from '../../stores/graph-store'
import { useSelectionStore } from '../../stores/selection-store'
import { CATEGORY_COLORS, BRIDGE_COLORS } from '../../constants/colors'

export default function CollectionCard() {
  const collection = useGraphStore(s => s.collection)
  const allNodes = useGraphStore(s => s.allNodes)
  const allLinks = useGraphStore(s => s.allLinks)
  const projects = useGraphStore(s => s.projects)
  const navigateTo = useSelectionStore(s => s.navigateTo)

  const entities = allNodes.filter(n => n.__type === 'entity')
  const bridges = entities.filter(n => n.__bridgeTier !== 'none')
  const goldBridges = entities.filter(n => n.__bridgeTier === 'gold')
  const silverBridges = entities.filter(n => n.__bridgeTier === 'silver')

  // Top 10 by pageRank
  const topEntities = [...entities]
    .sort((a, b) => b.pageRank - a.pageRank)
    .slice(0, 10)

  // Category breakdown
  const categoryMap = new Map<string, number>()
  for (const e of entities) {
    categoryMap.set(e.category, (categoryMap.get(e.category) || 0) + 1)
  }
  const categories = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {collection}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Collection Overview</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded px-2 py-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{projects.length}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Projects</div>
        </div>
        <div className="rounded px-2 py-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{entities.length}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Entities</div>
        </div>
        <div className="rounded px-2 py-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{allLinks.length}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Edges</div>
        </div>
        <div className="rounded px-2 py-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{bridges.length}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Bridges</div>
        </div>
      </div>

      {/* Bridge entities */}
      {bridges.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Bridge Entities ({bridges.length})
          </p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {goldBridges.length > 0 && (
              <div className="mb-1">
                <span className="text-xs" style={{ color: BRIDGE_COLORS.gold }}>Gold ({goldBridges.length})</span>
                <div className="ml-2">
                  {goldBridges.slice(0, 5).map(b => (
                    <span
                      key={b.name}
                      className="text-xs cursor-pointer hover:underline block"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={() => navigateTo(b.name)}
                    >
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {silverBridges.length > 0 && (
              <div>
                <span className="text-xs" style={{ color: BRIDGE_COLORS.silver }}>Silver ({silverBridges.length})</span>
                <div className="ml-2">
                  {silverBridges.slice(0, 5).map(b => (
                    <span
                      key={b.name}
                      className="text-xs cursor-pointer hover:underline block"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={() => navigateTo(b.name)}
                    >
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top entities by PageRank */}
      <div>
        <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Top Entities by Influence
        </p>
        <div className="space-y-0.5">
          {topEntities.map((entity, i) => {
            const catColor = CATEGORY_COLORS[entity.category] || '#6B7280'
            return (
              <div
                key={entity.name}
                className="flex items-center gap-1.5 cursor-pointer"
                onClick={() => navigateTo(entity.name)}
              >
                <span className="text-xs w-4 text-right" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                <span className="text-xs truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                  {entity.name}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {entity.pageRank.toFixed(1)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Category breakdown */}
      <div>
        <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Categories
        </p>
        <div className="space-y-0.5">
          {categories.map(([cat, count]) => {
            const color = CATEGORY_COLORS[cat] || '#6B7280'
            const pct = entities.length > 0 ? ((count / entities.length) * 100).toFixed(0) : '0'
            return (
              <div key={cat} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs flex-1" style={{ color: 'var(--text-primary)' }}>{cat}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{count} ({pct}%)</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
