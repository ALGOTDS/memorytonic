/**
 * Right Sidebar — Multi-card inspector container
 *
 * Source of truth: DESIGN-SPEC.md Section 6 (RSB)
 * 360px fixed width. Shows primary card + exploration stack.
 * Opens on node click. Closes on background click / Escape.
 */

import { useSelectionStore } from '../../stores/selection-store'
import { useGraphStore } from '../../stores/graph-store'
import PrimaryCard from './PrimaryCard'
import ProjectCard from './ProjectCard'
import CollectionCard from './CollectionCard'
import ExplorationCard from './ExplorationCard'

export default function RightSidebar() {
  const selectedNode = useSelectionStore(s => s.selectedNode)
  const lockedNode = useSelectionStore(s => s.lockedNode)
  const entityDetails = useSelectionStore(s => s.entityDetails)
  const explorationStack = useSelectionStore(s => s.explorationStack)
  const isLoadingDetail = useSelectionStore(s => s.isLoadingDetail)
  const showCollectionCard = useSelectionStore(s => s.showCollectionCard)
  const removeExplorationCard = useSelectionStore(s => s.removeExplorationCard)
  const toggleExplorationExpanded = useSelectionStore(s => s.toggleExplorationExpanded)
  const navigateTo = useSelectionStore(s => s.navigateTo)
  const clearAll = useSelectionStore(s => s.clearAll)

  const projects = useGraphStore(s => s.projects)

  if (!selectedNode && !showCollectionCard) return null

  // Determine which node to show as primary (locked takes precedence)
  const primaryNode = lockedNode || selectedNode
  const detail = primaryNode ? entityDetails.get(primaryNode.name) : null

  return (
    <div
      className="h-full overflow-y-auto flex-shrink-0"
      style={{
        width: 360,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '10px' }}>
          Inspector
        </span>
        <button
          onClick={clearAll}
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ color: 'var(--text-muted)', background: 'var(--surface-hover)' }}
          title="Close panel (Esc)"
        >
          ✕
        </button>
      </div>

      {/* Collection card */}
      {showCollectionCard && (
        <div className="p-3">
          <CollectionCard />
        </div>
      )}

      {/* Loading state */}
      {!showCollectionCard && isLoadingDetail && !detail && (
        <div className="p-4">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      )}

      {/* Project card (standalone or while locked on an entity) */}
      {primaryNode && primaryNode.__type === 'project' && (
        <div className="p-3">
          <ProjectCard
            project={projects.find(p => p.uniqueId === primaryNode.id) || {
              name: primaryNode.name,
              uniqueId: primaryNode.id,
              summary: '',
              domain: '',
              subdomain: '',
              baseTags: [],
              htmlPath: '',
            }}
          />
        </div>
      )}
      {lockedNode && selectedNode && selectedNode.__type === 'project' && (
        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <ProjectCard
            project={projects.find(p => p.uniqueId === selectedNode.id) || {
              name: selectedNode.name,
              uniqueId: selectedNode.id,
              summary: '',
              domain: '',
              subdomain: '',
              baseTags: [],
              htmlPath: '',
            }}
          />
        </div>
      )}

      {/* Entity primary card */}
      {primaryNode && primaryNode.__type === 'entity' && detail && (
        <div className="p-3">
          <PrimaryCard node={primaryNode} detail={detail} />
        </div>
      )}

      {/* Exploration card stack */}
      {explorationStack.length > 0 && lockedNode && (
        <div>
          {explorationStack.map(card => (
            <ExplorationCard
              key={card.entity.name}
              card={card}
              lockedName={lockedNode.name}
              onClose={() => removeExplorationCard(card.entity.name)}
              onToggle={() => toggleExplorationExpanded(card.entity.name)}
              onNavigate={navigateTo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
