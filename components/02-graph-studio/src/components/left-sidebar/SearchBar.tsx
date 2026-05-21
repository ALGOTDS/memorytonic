/**
 * SearchBar — LSB Section 2: Entity search with results
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (Section 2), Section 11
 * Debounce 300ms, min 2 chars, results below input, click → zoom + select.
 * Matching nodes get yellow ring on canvas via graph-store.searchHighlights.
 */

import { useState, useEffect, useRef } from 'react'
import { useGraphStore } from '../../stores/graph-store'
import { useSelectionStore } from '../../stores/selection-store'
import { useUIStore } from '../../stores/ui-store'
import { fulltextSearch } from '../../services/queries'
import { CATEGORY_COLORS } from '../../constants/colors'
import type { SearchResult } from '../../types/graph'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setSearchHighlights = useGraphStore(s => s.setSearchHighlights)
  const allNodes = useGraphStore(s => s.allNodes)
  const collection = useGraphStore(s => s.collection)
  const selectNode = useSelectionStore(s => s.selectNode)
  // Read zoomToNode imperatively to avoid re-render during ForceGraph2D render cycle
  const getZoomToNode = () => useUIStore.getState().zoomToNode

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 2) {
      setResults([])
      setSearchHighlights(new Set())
      return
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fulltextSearch(query, collection)
        setResults(res)
        setSearchHighlights(new Set(res.map(r => r.name)))
      } catch (err) {
        console.error('Search failed:', err)
        // Fallback: client-side name matching
        const lowerQ = query.toLowerCase()
        const matches = allNodes
          .filter(n => n.__type === 'entity' && n.name.toLowerCase().includes(lowerQ))
          .slice(0, 20)
          .map(n => ({
            name: n.name,
            category: n.category,
            definition: n.definition || '',
            score: 1,
          }))
        setResults(matches)
        setSearchHighlights(new Set(matches.map(m => m.name)))
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, allNodes, collection, setSearchHighlights])

  const handleClear = () => {
    setQuery('')
    setResults([])
    setSearchHighlights(new Set())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleClear()
  }

  const handleResultClick = (entityName: string) => {
    const node = allNodes.find(n => n.name === entityName)
    if (!node) return
    selectNode(node)
    getZoomToNode()?.(node.id)
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="px-3 py-2">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search entities..."
            className="w-full text-xs rounded px-2 py-1.5 outline-none"
            style={{
              background: 'var(--bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto px-3 pb-2">
          {isSearching && (
            <p className="text-xs py-1" style={{ color: 'var(--text-muted)' }}>Searching...</p>
          )}
          {results.map(result => {
            const catColor = CATEGORY_COLORS[result.category] || '#6B7280'
            return (
              <button
                key={result.name}
                onClick={() => handleResultClick(result.name)}
                className="w-full flex items-start gap-2 py-1.5 text-left rounded px-1 hover:brightness-110"
                style={{ background: 'transparent' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
                  style={{ backgroundColor: catColor }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {result.name}
                  </div>
                  {result.definition && (
                    <div
                      className="text-xs truncate mt-0.5"
                      style={{ color: 'var(--text-muted)', maxWidth: '100%' }}
                    >
                      {result.definition.slice(0, 80)}
                      {result.definition.length > 80 ? '...' : ''}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="px-3 pb-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No results</p>
        </div>
      )}
    </div>
  )
}
