/**
 * PathFinder — LSB Section 8: Multi-entity shortest path finder
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (Section 8), Section 12
 * Up to 5 entities. Computes N*(N-1)/2 shortest paths in parallel.
 * Results highlight on canvas via graph-store.highlightedPath.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useGraphStore } from '../../stores/graph-store'
import { useUIStore } from '../../stores/ui-store'
import { useSelectionStore } from '../../stores/selection-store'
import { findShortestPath } from '../../services/queries'
import { CATEGORY_COLORS, CAUSAL_COLORS } from '../../constants/colors'
import CollapsibleSection from '../shared/CollapsibleSection'
import type { PathResult } from '../../types/graph'

export default function PathFinder() {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<Array<{ name: string; category: string }>>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const allNodes = useGraphStore(s => s.allNodes)
  const collection = useGraphStore(s => s.collection)
  const setHighlightedPath = useGraphStore(s => s.setHighlightedPath)
  const clearPath = useGraphStore(s => s.clearPath)

  const pathEntities = useUIStore(s => s.pathEntities)
  const pathResults = useUIStore(s => s.pathResults)
  const isComputingPaths = useUIStore(s => s.isComputingPaths)
  const addPathEntity = useUIStore(s => s.addPathEntity)
  const removePathEntity = useUIStore(s => s.removePathEntity)
  const setPathResults = useUIStore(s => s.setPathResults)
  const setIsComputingPaths = useUIStore(s => s.setIsComputingPaths)
  const exitPathMode = useUIStore(s => s.exitPathMode)
  const zoomToNode = useUIStore(s => s.zoomToNode)

  // Filter autocomplete suggestions (entities + projects)
  useEffect(() => {
    if (inputValue.length < 1) {
      setSuggestions([])
      return
    }
    const lower = inputValue.toLowerCase()
    const matches = allNodes
      .filter(n =>
        n.name.toLowerCase().includes(lower) &&
        !pathEntities.includes(n.name)
      )
      .slice(0, 8)
      .map(n => ({ name: n.name, category: n.category }))
    setSuggestions(matches)
  }, [inputValue, allNodes, pathEntities])

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleAddEntity = useCallback((name: string) => {
    addPathEntity(name)
    setInputValue('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }, [addPathEntity])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && suggestions.length > 0 && suggestions[0]) {
      handleAddEntity(suggestions[0].name)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setInputValue('')
    }
  }

  // Compute all pairs of shortest paths
  const computePaths = useCallback(async () => {
    if (pathEntities.length < 2) return

    setIsComputingPaths(true)
    setPathResults([])
    clearPath()

    const pairs: [string, string][] = []
    for (let i = 0; i < pathEntities.length; i++) {
      for (let j = i + 1; j < pathEntities.length; j++) {
        const ei = pathEntities[i]
        const ej = pathEntities[j]
        if (ei && ej) pairs.push([ei, ej])
      }
    }

    try {
      const results = await Promise.all(
        pairs.map(([a, b]) => findShortestPath(a, b, collection))
      )
      const validResults = results.filter((r): r is PathResult => r !== null)
      setPathResults(validResults)

      // Highlight all entities in all paths
      const allPathEntities = new Set<string>()
      for (const path of validResults) {
        for (const entity of path.entities) {
          allPathEntities.add(entity)
        }
      }
      setHighlightedPath([...allPathEntities])
    } catch (err) {
      console.error('Path computation failed:', err)
    } finally {
      setIsComputingPaths(false)
    }
  }, [pathEntities, collection, setIsComputingPaths, setPathResults, clearPath, setHighlightedPath])

  const handleClearAll = useCallback(() => {
    exitPathMode()
    clearPath()
  }, [exitPathMode, clearPath])

  const selectNode = useSelectionStore(s => s.selectNode)

  const handlePathClick = useCallback((path: PathResult) => {
    // Highlight just this path and zoom to the first entity
    setHighlightedPath(path.entities)
    const node = allNodes.find(n => n.name === path.entities[0])
    if (node) zoomToNode?.(node.id)
  }, [setHighlightedPath, allNodes, zoomToNode])

  const handleEntityInPathClick = useCallback((entityName: string) => {
    const node = allNodes.find(n => n.name === entityName)
    if (!node) return
    selectNode(node)
    zoomToNode?.(node.id)
  }, [allNodes, selectNode, zoomToNode])

  return (
    <CollapsibleSection title="Path Finder" defaultOpen={false} id="lsb-pathfinder">
      {/* Entity input with autocomplete */}
      <div className="relative mb-2">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value)
            setShowSuggestions(true)
          }}
          onFocus={() => inputValue.length >= 1 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={pathEntities.length >= 5 ? 'Max 5 entities' : 'Add entity...'}
          disabled={pathEntities.length >= 5}
          className="w-full text-xs rounded px-2 py-1.5 outline-none"
          style={{
            background: 'var(--bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            opacity: pathEntities.length >= 5 ? 0.5 : 1,
          }}
        />

        {/* Autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 w-full mt-1 rounded overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            {suggestions.map(s => {
              const isProject = s.category === 'project'
              const color = isProject ? '#a1a1aa' : (CATEGORY_COLORS[s.category] || '#6B7280')
              return (
                <button
                  key={s.name}
                  onClick={() => handleAddEntity(s.name)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    className={`w-1.5 h-1.5 flex-shrink-0 ${isProject ? 'rounded-sm' : 'rounded-full'}`}
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate">{s.name}</span>
                  {isProject && (
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      project
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected entities as pills */}
      {pathEntities.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {pathEntities.map((name) => {
            const node = allNodes.find(n => n.name === name)
            const color = node ? CATEGORY_COLORS[node.category] || '#6B7280' : '#6B7280'
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                style={{
                  background: color + '22',
                  border: `1px solid ${color}44`,
                  color: 'var(--text-primary)',
                }}
              >
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate max-w-[100px]">{name}</span>
                <button
                  onClick={() => removePathEntity(name)}
                  className="ml-0.5 hover:brightness-150"
                  style={{ color: 'var(--text-muted)', fontSize: '9px' }}
                >
                  ✕
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5 mb-2">
        <button
          onClick={computePaths}
          disabled={pathEntities.length < 2 || isComputingPaths}
          className="flex-1 text-xs py-1 px-2 rounded"
          style={{
            background: pathEntities.length >= 2 ? 'var(--accent)' : 'var(--surface-hover)',
            color: pathEntities.length >= 2 ? '#fff' : 'var(--text-muted)',
            opacity: isComputingPaths ? 0.6 : 1,
            cursor: pathEntities.length < 2 || isComputingPaths ? 'not-allowed' : 'pointer',
          }}
        >
          {isComputingPaths ? 'Computing...' : 'Find Paths'}
        </button>
        {(pathEntities.length > 0 || pathResults.length > 0) && (
          <button
            onClick={handleClearAll}
            className="text-xs py-1 px-2 rounded"
            style={{
              background: 'var(--surface-hover)',
              color: 'var(--text-muted)',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Path results */}
      {pathResults.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {pathResults.length} path{pathResults.length !== 1 ? 's' : ''} found
          </p>
          {pathResults.map((path, i) => (
            <div
              key={`${path.from}-${path.to}-${i}`}
              className="rounded-md overflow-hidden"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              {/* Path header — click to highlight on graph */}
              <button
                onClick={() => handlePathClick(path)}
                className="w-full text-left px-2.5 py-2 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {path.from} <span style={{ color: 'var(--accent)' }}>&rarr;</span> {path.to}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2"
                  style={{ background: 'var(--accent)', color: '#fff', fontSize: '10px' }}
                >
                  {path.hops} hop{path.hops !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Path steps — each entity is clickable */}
              <div className="px-2.5 py-1.5 space-y-1">
                {path.entities.map((entity, j) => {
                  const node = allNodes.find(n => n.name === entity)
                  const isProject = node?.__type === 'project'
                  const catColor = isProject ? '#71717a' : (node ? CATEGORY_COLORS[node.category] || '#6B7280' : '#6B7280')
                  const relType = j < path.relTypes.length ? path.relTypes[j] : undefined
                  const relColor = relType ? (CAUSAL_COLORS[relType] ?? 'var(--text-muted)') : undefined

                  return (
                    <div key={entity}>
                      {/* Entity row */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEntityInPathClick(entity) }}
                        className="w-full flex items-center gap-1.5 py-0.5 text-left rounded hover:brightness-125"
                      >
                        <span
                          className={`w-2 h-2 flex-shrink-0 ${isProject ? 'rounded-sm' : 'rounded-full'}`}
                          style={{ backgroundColor: catColor }}
                        />
                        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {entity}
                        </span>
                        {isProject && (
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
                            project
                          </span>
                        )}
                      </button>

                      {/* Relationship arrow between steps */}
                      {relType && relColor && j < path.entities.length - 1 && (
                        <div className="flex items-center gap-1.5 pl-1 py-0.5">
                          <span style={{ color: relColor, fontSize: '10px' }}>&#x2502;</span>
                          <span
                            className="text-xs px-1 py-0.5 rounded"
                            style={{
                              color: relColor,
                              background: (relColor || '') + '15',
                              fontSize: '10px',
                              fontWeight: 500,
                            }}
                          >
                            {relType}
                          </span>
                          <span style={{ color: relColor, fontSize: '10px' }}>&#x25BC;</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No paths found */}
      {pathEntities.length >= 2 && pathResults.length === 0 && !isComputingPaths &&
        pathEntities.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Click "Find Paths" to discover connections
        </p>
      )}
    </CollapsibleSection>
  )
}
