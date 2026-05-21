/**
 * StatusBar — Bottom overlay showing graph stats + canvas controls
 *
 * Source of truth: DESIGN-SPEC.md Section 2 (StatusBar)
 * Shows: visible node/edge counts, zoom level, active filter summary.
 * Controls: Unpin All (clears fx/fy), Reheat (restarts simulation).
 */

import { useGraphStore } from '../stores/graph-store'
import { useUIStore } from '../stores/ui-store'

export default function StatusBar() {
  const filteredNodes = useGraphStore(s => s.filteredNodes)
  const filteredLinks = useGraphStore(s => s.filteredLinks)
  const allNodes = useGraphStore(s => s.allNodes)
  const allLinks = useGraphStore(s => s.allLinks)
  const highlightedPath = useGraphStore(s => s.highlightedPath)
  const searchHighlights = useGraphStore(s => s.searchHighlights)
  const currentZoom = useUIStore(s => s.currentZoom)
  const unpinAllNodes = useUIStore(s => s.unpinAllNodes)
  const reheatSimulation = useUIStore(s => s.reheatSimulation)

  const entityCount = filteredNodes.filter(n => n.__type === 'entity').length
  const projectCount = filteredNodes.filter(n => n.__type === 'project').length
  const isFiltered = filteredNodes.length !== allNodes.length || filteredLinks.length !== allLinks.length

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1.5 text-xs"
      style={{
        background: 'rgba(10, 10, 15, 0.92)',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-muted)',
        zIndex: 10,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Stats — non-interactive */}
      <div className="flex items-center gap-3" style={{ pointerEvents: 'none' }}>
        <span>{entityCount} entities</span>
        <span>{projectCount} projects</span>
        <span>{filteredLinks.length} edges</span>
        {isFiltered && (
          <span style={{ color: 'var(--accent)' }}>
            (filtered from {allNodes.length}/{allLinks.length})
          </span>
        )}
      </div>

      {/* Right side: overlays + controls */}
      <div className="flex items-center gap-2">
        {searchHighlights.size > 0 && (
          <span style={{ color: 'var(--warning)', pointerEvents: 'none' }}>
            {searchHighlights.size} matches
          </span>
        )}
        {highlightedPath.length > 0 && (
          <span style={{ color: '#22D3EE', pointerEvents: 'none' }}>
            Path: {highlightedPath.length}
          </span>
        )}
        <span style={{ pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}>
          {currentZoom.toFixed(1)}x
        </span>

        {/* Canvas control buttons — clickable */}
        <div
          className="flex gap-1 ml-1"
          style={{ pointerEvents: 'auto' }}
        >
          <button
            onClick={() => unpinAllNodes?.()}
            className="px-2 py-0.5 rounded text-xs"
            style={{
              background: 'var(--surface-hover)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            title="Unpin all dragged nodes and reheat layout"
          >
            Unpin All
          </button>
          <button
            onClick={() => reheatSimulation?.()}
            className="px-2 py-0.5 rounded text-xs"
            style={{
              background: 'var(--surface-hover)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            title="Reheat force simulation"
          >
            Reheat
          </button>
        </div>
      </div>
    </div>
  )
}
