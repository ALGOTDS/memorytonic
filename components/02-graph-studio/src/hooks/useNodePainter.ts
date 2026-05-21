/**
 * useNodePainter — Custom canvas rendering for graph nodes
 *
 * Source of truth: DESIGN-SPEC.md Section 9 (Node Rendering Pipeline)
 *
 * Paint order (back to front, per node):
 *   1. GLOW (bridge entities only)
 *   2. BRIDGE RING (bridge entities only)
 *   3. FILL CIRCLE (category color)
 *   4. SELECTION RING (selected / exploration stack)
 *   5. SEARCH HIGHLIGHT (if matches search)
 *   6. LABEL (zoom-dependent + forced for special nodes)
 *   7. DIMMING (globalAlpha for non-highlighted)
 *
 * LOD thresholds (globalScale):
 *   < 0.3  → dots only (2px)
 *   0.3-0.8 → circles, no labels
 *   0.8-1.5 → circles + forced labels only
 *   1.5-3.0 → all labels
 *   > 3.0  → all labels + edge labels (edge labels handled separately)
 */

import { useCallback } from 'react'
import { CATEGORY_COLORS, PROJECT_NODE_COLOR, BRIDGE_COLORS, THEME } from '../constants/colors'
import { LOD_THRESHOLDS } from '../constants/config'
import type { GraphNode } from '../types/graph'

const TWO_PI = 2 * Math.PI

interface PainterOptions {
  selectedNodeId: string | null
  hoveredNodeId: string | null
  searchHighlights: Set<string>
  pathSet: Set<string>                // entity names in active path (O(1) lookup)
  chainSet: Set<string>               // entity names in active chain (O(1) lookup)
  highlightSet: Set<string> | null    // hop-radius highlight set (Phase 5)
  explorationStackIds: Set<string>    // entities in exploration stack (Phase 5)
}

/**
 * Returns a (node, ctx, globalScale) => void callback for nodeCanvasObject.
 */
export function useNodePainter(options: PainterOptions) {
  const {
    selectedNodeId,
    hoveredNodeId,
    searchHighlights,
    pathSet,
    chainSet,
    highlightSet,
    explorationStackIds,
  } = options

  return useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0
    const y = node.y ?? 0
    const radius = node.__radius || 8
    const color = node.__type === 'project'
      ? PROJECT_NODE_COLOR
      : (CATEGORY_COLORS[node.category] || '#6B7280')

    // ── Step 7: DIMMING (applied first as globalAlpha) ──────
    const hasActiveHighlight = highlightSet !== null && highlightSet.size > 0
    const pathActive = pathSet.size > 0
    const chainActive = chainSet.size > 0
    const isInHighlight = highlightSet?.has(node.id) ?? false
    const isInPath = pathSet.has(node.name)
    const isInChain = chainSet.has(node.name)
    const isDimmed = (hasActiveHighlight || pathActive || chainActive) && !isInHighlight && !isInPath && !isInChain

    if (isDimmed) {
      ctx.globalAlpha = 0.15
    }

    // ── LOD: Dot mode at very low zoom ──────────────────────
    if (globalScale < LOD_THRESHOLDS.dot) {
      // Just a tiny dot
      ctx.fillStyle = color
      ctx.fillRect(x - 1, y - 1, 2, 2)
      ctx.globalAlpha = 1.0
      return
    }

    // ── Step 1: GLOW (bridge entities only) ─────────────────
    if (node.__bridgeTier !== 'none') {
      const glowColor = BRIDGE_COLORS[node.__bridgeTier]
      if (glowColor && glowColor !== 'transparent') {
        const glowRadius = node.__bridgeTier === 'gold' ? radius + 8
          : node.__bridgeTier === 'silver' ? radius + 6
          : radius + 4
        const glowOpacity = node.__bridgeTier === 'gold' ? '4D'  // 30%
          : node.__bridgeTier === 'silver' ? '33'                 // 20%
          : '26'                                                  // 15%

        const gradient = ctx.createRadialGradient(x, y, radius, x, y, glowRadius)
        gradient.addColorStop(0, glowColor + glowOpacity)
        gradient.addColorStop(1, glowColor + '00')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, glowRadius, 0, TWO_PI)
        ctx.fill()
      }
    }

    // ── Step 2: BRIDGE RING (bridge entities only) ──────────
    if (node.__bridgeTier !== 'none') {
      const ringColor = BRIDGE_COLORS[node.__bridgeTier]
      if (ringColor && ringColor !== 'transparent') {
        const lineWidth = node.__bridgeTier === 'gold' ? 2.5
          : node.__bridgeTier === 'silver' ? 2
          : 1.5
        ctx.strokeStyle = ringColor
        ctx.lineWidth = lineWidth / globalScale  // scale-independent
        ctx.beginPath()
        ctx.arc(x, y, radius + 2, 0, TWO_PI)
        ctx.stroke()
      }
    }

    // ── Step 3: FILL SHAPE (circle for entities, rounded rect for projects) ──
    if (node.__type === 'project') {
      // Square with rounded corners — visually distinct from entities
      const side = radius * 2
      const cornerR = 3
      ctx.beginPath()
      ctx.roundRect(x - radius, y - radius, side, side, cornerR)
      ctx.fillStyle = color
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, TWO_PI)
      ctx.fillStyle = color
      ctx.fill()
    }

    // ── Step 4: SELECTION RING ──────────────────────────────
    const isSelected = node.id === selectedNodeId
    const isInStack = explorationStackIds.has(node.id)

    if (isSelected || isInStack) {
      ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = (isSelected ? 2 : 1) / globalScale
      ctx.beginPath()
      if (node.__type === 'project') {
        const side = (radius + 1) * 2
        ctx.roundRect(x - radius - 1, y - radius - 1, side, side, 4)
      } else {
        ctx.arc(x, y, radius + 1, 0, TWO_PI)
      }
      ctx.stroke()
    }

    // ── Step 5a: SEARCH HIGHLIGHT ───────────────────────────
    if (searchHighlights.has(node.name)) {
      ctx.strokeStyle = THEME.warning  // #FBBF24 yellow
      ctx.lineWidth = 1.5 / globalScale
      ctx.beginPath()
      ctx.arc(x, y, radius + 3, 0, TWO_PI)
      ctx.stroke()
    }

    // ── Step 5b: PATH HIGHLIGHT ──────────────────────────────
    if (isInPath) {
      ctx.strokeStyle = '#22D3EE'  // cyan for path
      ctx.lineWidth = 2 / globalScale
      ctx.beginPath()
      ctx.arc(x, y, radius + 3, 0, TWO_PI)
      ctx.stroke()
    }

    // ── Step 5c: CHAIN HIGHLIGHT ─────────────────────────────
    if (isInChain) {
      const chainGlowRadius = radius + 6
      const gradient = ctx.createRadialGradient(x, y, radius, x, y, chainGlowRadius)
      gradient.addColorStop(0, '#6d9eeb4D')  // accent ~30%
      gradient.addColorStop(1, '#6d9eeb00')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(x, y, chainGlowRadius, 0, TWO_PI)
      ctx.fill()

      ctx.strokeStyle = '#6d9eeb'
      ctx.lineWidth = 2 / globalScale
      ctx.beginPath()
      ctx.arc(x, y, radius + 3, 0, TWO_PI)
      ctx.stroke()
    }

    // ── Step 6: LABEL (zoom-dependent + forced) ─────────────
    const isHovered = node.id === hoveredNodeId
    const showLabel = (
      globalScale > LOD_THRESHOLDS.label ||          // All labels at high zoom (>1.5)
      node.__type === 'project' ||                   // Projects always
      node.__bridgeTier === 'gold' ||                // Gold bridges always
      node.__bridgeTier === 'silver' ||              // Silver bridges always
      node.__compositeImportance >= 95 ||            // Top 5% always
      isSelected ||                                  // Selected always
      isHovered                                      // Hovered always
    )

    if (showLabel && globalScale >= LOD_THRESHOLDS.dot) {
      const fontSize = Math.max(3, 12 / globalScale)
      ctx.font = `${fontSize}px system-ui, sans-serif`
      ctx.fillStyle = THEME.textPrimary
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(node.name, x, y + radius + 2 / globalScale)
    }

    // ── Reset globalAlpha ───────────────────────────────────
    if (isDimmed) {
      ctx.globalAlpha = 1.0
    }
  }, [
    selectedNodeId, hoveredNodeId, searchHighlights,
    pathSet, chainSet, highlightSet, explorationStackIds,
  ])
}
