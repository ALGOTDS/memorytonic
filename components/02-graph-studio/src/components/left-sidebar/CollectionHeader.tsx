/**
 * LSB Section 1: Collection Header (always visible, not collapsible)
 *
 * Source of truth: DESIGN-SPEC.md Section 5, Section 1
 */

import { useGraphStore } from '../../stores/graph-store'
import { useSelectionStore } from '../../stores/selection-store'

export default function CollectionHeader() {
  const collection = useGraphStore(s => s.collection)
  const allCount = useGraphStore(s => s.allNodes.filter(n => n.__type === 'entity').length)
  const filteredCount = useGraphStore(s => s.filteredNodes.filter(n => n.__type === 'entity').length)
  const linkCount = useGraphStore(s => s.filteredLinks.length)
  const projectCount = useGraphStore(s => s.projects.length)
  const openCollectionCard = useSelectionStore(s => s.openCollectionCard)

  return (
    <div
      className="px-4 py-3 cursor-pointer"
      style={{
        borderBottom: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
        background: 'var(--accent-dim)',
      }}
      onClick={openCollectionCard}
    >
      <div className="text-xs" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '10px' }}>
        Collection
      </div>
      <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
        {collection}
      </div>
      <div className="flex gap-3 mt-2">
        <div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {filteredCount === allCount ? allCount : `${filteredCount}/${allCount}`}
          </span>
          <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>entities</span>
        </div>
        <div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{linkCount}</span>
          <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>edges</span>
        </div>
        <div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{projectCount}</span>
          <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>projects</span>
        </div>
      </div>
    </div>
  )
}
