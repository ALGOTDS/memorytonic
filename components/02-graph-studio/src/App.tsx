/**
 * Graph Studio — Application Shell
 *
 * Source of truth: DESIGN-SPEC.md Section 2 (Layout Architecture)
 * 3-column layout: LSB (280px fixed) + Canvas (flex) + RSB (360px, opens on click)
 *
 * Phase 4: LSB + Canvas layout. RSB added in Phase 5.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useGraphStore } from './stores/graph-store'
import { useSelectionStore } from './stores/selection-store'
import GraphCanvas from './components/GraphCanvas'
import LeftSidebar from './components/left-sidebar/LeftSidebar'
import RightSidebar from './components/right-sidebar/RightSidebar'
import Legend from './components/Legend'
import StatusBar from './components/StatusBar'
import CollectionPicker from './components/CollectionPicker'

interface AppProps {
  initialCollection?: string
}

export default function App({ initialCollection }: AppProps = {}) {
  const loadCollection = useGraphStore(s => s.loadCollection)
  const isLoading = useGraphStore(s => s.isLoading)
  const error = useGraphStore(s => s.error)
  const nodeCount = useGraphStore(s => s.allNodes.length)

  const [selectedCollection, setSelectedCollection] = useState<string | null>(initialCollection ?? null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const clearAll = useSelectionStore(s => s.clearAll)
  const selectedNode = useSelectionStore(s => s.selectedNode)
  const showCollectionCard = useSelectionStore(s => s.showCollectionCard)

  const handleCollectionSelect = useCallback((collectionName: string) => {
    setSelectedCollection(collectionName)
    loadCollection(collectionName)
  }, [loadCollection])

  // Auto-load when initialCollection is provided
  useEffect(() => {
    if (initialCollection && !isLoading && nodeCount === 0) {
      loadCollection(initialCollection)
    }
  }, [initialCollection, loadCollection, isLoading, nodeCount])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }

      if (e.key === 'Escape') clearAll()
      if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder="Search entities..."]')
        searchInput?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearAll])

  // Track canvas container dimensions
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateSize = () => {
      setDimensions({ width: el.clientWidth, height: el.clientHeight })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [isLoading])

  // Collection picker gate — show picker until user selects
  if (!selectedCollection) {
    return <CollectionPicker onSelect={handleCollectionSelect} />
  }

  const showGraph = !isLoading && !error && nodeCount > 0
  const showRSB = selectedNode || showCollectionCard

  return (
    <div className="h-full w-full flex" style={{ background: 'var(--bg)' }}>
      {/* Left Sidebar — 280px fixed */}
      {showGraph && <LeftSidebar />}

      {/* Canvas area — fills remaining */}
      <div className="flex-1 min-w-0 h-full flex flex-col">
        {/* Graph container (measured for canvas dimensions) */}
        <div ref={containerRef} className="flex-1 min-w-0 min-h-0 relative overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p style={{ color: 'var(--text-muted)' }}>Loading collection...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p style={{ color: 'var(--error)' }}>Failed to load: {error}</p>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Check Neo4j is running (bolt://localhost:7687, database: memorytonic)
                </p>
              </div>
            </div>
          )}

          {showGraph && dimensions.width > 0 && dimensions.height > 0 && (
            <GraphCanvas width={dimensions.width} height={dimensions.height} />
          )}

          {showGraph && <StatusBar />}
        </div>

        {/* Legend bar below graph — horizontal categories + bridges */}
        {showGraph && <Legend />}
      </div>

      {/* Right Sidebar — 360px, opens on node click or collection header */}
      {showGraph && showRSB && <RightSidebar />}
    </div>
  )
}
