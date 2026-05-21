/**
 * GraphCanvas — Force-directed graph using react-force-graph-2d
 *
 * Source of truth: DESIGN-SPEC.md Section 4 (Canvas Props), Section 9, Section 10
 *
 * Phase 2: Basic rendering with category colors + size levels.
 * Phase 3: Custom nodeCanvasObject, LOD, bridge glow, edge dash, hit detection.
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { useGraphData } from '../hooks/useGraphData'
import { useNodePainter } from '../hooks/useNodePainter'
import { useGraphStore } from '../stores/graph-store'
import { useSelectionStore } from '../stores/selection-store'
import { useUIStore } from '../stores/ui-store'
import { CAUSAL_COLORS } from '../constants/colors'
import {
  FORCE_CONFIG, MAGNITUDE_WIDTH, ARROW_LENGTH, ARROW_REL_POS,
  EVIDENCE_DASH, MENTIONED_IN_CLASSIFICATION, MENTIONED_IN_WIDTH, MENTIONED_IN_DASH,
} from '../constants/config'
import { MENTIONED_IN_COLOR } from '../constants/colors'
import EdgeTooltip, { type EdgeTooltipData } from './shared/EdgeTooltip'
import type { GraphNode, GraphLink } from '../types/graph'

interface Props {
  width: number
  height: number
}

export default function GraphCanvas({ width, height }: Props) {
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltipData | null>(null)
  const graphData = useGraphData()
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)

  // Store state for painter
  const searchHighlights = useGraphStore(s => s.searchHighlights)
  const highlightedPath = useGraphStore(s => s.highlightedPath)
  const highlightedChain = useGraphStore(s => s.highlightedChain)

  // Selection state (Phase 5)
  const selectedNode = useSelectionStore(s => s.selectedNode)
  const hoveredNode = useSelectionStore(s => s.hoveredNode)
  const lockedNode = useSelectionStore(s => s.lockedNode)
  const hopRadius = useSelectionStore(s => s.hopRadius)
  const explorationStack = useSelectionStore(s => s.explorationStack)

  const selectedNodeId = selectedNode?.id ?? null
  const hoveredNodeId = hoveredNode?.id ?? null

  // Compute hop set for highlighting
  const highlightSet = useMemo(() => {
    const focusNode = lockedNode || selectedNode
    if (!focusNode || focusNode.__type === 'project') return null

    const visited = new Set<string>([focusNode.id])
    let frontier = [focusNode.id]

    for (let hop = 0; hop < hopRadius; hop++) {
      const nextFrontier: string[] = []
      for (const nodeId of frontier) {
        const node = graphData.nodes.find(n => n.id === nodeId)
        if (node?.__neighborIds) {
          for (const neighborId of node.__neighborIds) {
            if (!visited.has(neighborId)) {
              visited.add(neighborId)
              nextFrontier.push(neighborId)
            }
          }
        }
      }
      frontier = nextFrontier
    }
    return visited
  }, [lockedNode, selectedNode, hopRadius, graphData.nodes])

  // IDs of entities in exploration stack
  const explorationStackIds = useMemo(
    () => new Set(explorationStack.map(c => c.entity.id)),
    [explorationStack],
  )

  // Pre-compute Sets for O(1) lookups in painter and edge callbacks
  const chainSet = useMemo(() => new Set(highlightedChain), [highlightedChain])
  const pathSet = useMemo(() => new Set(highlightedPath), [highlightedPath])

  // Custom node painter
  const paintNode = useNodePainter({
    selectedNodeId,
    hoveredNodeId,
    searchHighlights,
    pathSet,
    chainSet,
    highlightSet,
    explorationStackIds,
  })

  // Hit detection — CRITICAL for custom-painted nodes (square for projects)
  const paintHitArea = useCallback((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
    const r = (node.__radius || 8) + 2
    ctx.fillStyle = color
    if (node.__type === 'project') {
      ctx.fillRect((node.x ?? 0) - r, (node.y ?? 0) - r, r * 2, r * 2)
    } else {
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI)
      ctx.fill()
    }
  }, [])

  // Register zoom-to-node callback for SearchBar / PathFinder
  // Deferred to avoid "setState during render" warning when ForceGraph2D triggers re-renders
  const registerZoomToNode = useUIStore(s => s.registerZoomToNode)
  const registerUnpinAll = useUIStore(s => s.registerUnpinAll)
  const registerReheat = useUIStore(s => s.registerReheat)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      registerZoomToNode((nodeId: string) => {
        const fg = fgRef.current
        if (!fg) return
        const node = graphData.nodes.find(n => n.id === nodeId)
        if (!node || node.x == null || node.y == null) return
        fg.centerAt(node.x, node.y, 1000)
        fg.zoom(6, 1000)
      })
      registerUnpinAll(() => {
        for (const node of graphData.nodes) {
          node.fx = undefined
          node.fy = undefined
        }
        fgRef.current?.d3ReheatSimulation()
      })
      registerReheat(() => {
        fgRef.current?.d3ReheatSimulation()
      })
    })
    return () => cancelAnimationFrame(id)
  }, [graphData.nodes, registerZoomToNode, registerUnpinAll, registerReheat])

  // Configure forces after mount
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return

    fg.d3Force('charge')?.strength(FORCE_CONFIG.chargeStrength)
    fg.d3Force('link')?.distance(FORCE_CONFIG.linkDistance)
    fg.d3Force('center')?.strength(FORCE_CONFIG.centerStrength)

    import('d3-force-3d').then(d3 => {
      fg.d3Force('collide', d3.forceCollide()
        .radius((node: GraphNode) => (node.__radius || 8) + FORCE_CONFIG.collideRadiusPadding)
        .iterations(1)
      )
    })
  }, [graphData])

  // Build set of adjacent pairs for path highlighting
  // "A→B" means A and B are adjacent in the path — edge between them is on the path
  const pathEdgePairs = useMemo(() => {
    if (highlightedPath.length < 2) return new Set<string>()
    const pairs = new Set<string>()
    for (let i = 0; i < highlightedPath.length - 1; i++) {
      const a = highlightedPath[i]
      const b = highlightedPath[i + 1]
      pairs.add(`${a}→${b}`)
      pairs.add(`${b}→${a}`)  // edges are bidirectional
    }
    return pairs
  }, [highlightedPath])

  const pathActive = highlightedPath.length >= 2

  const isLinkOnPath = useCallback((link: GraphLink): boolean => {
    if (!pathActive) return false
    const srcName = typeof link.source === 'object' ? link.source.name : ''
    const tgtName = typeof link.target === 'object' ? link.target.name : ''
    return pathEdgePairs.has(`${srcName}→${tgtName}`)
  }, [pathActive, pathEdgePairs])

  // Check if BOTH endpoints of a link are within the hop-radius neighborhood
  // Returns null when no selection is active (no dimming needed)
  const isLinkInNeighborhood = useCallback((link: GraphLink): boolean | null => {
    if (!highlightSet || highlightSet.size === 0) return null
    const srcId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source)
    const tgtId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target)
    return highlightSet.has(srcId) && highlightSet.has(tgtId)
  }, [highlightSet])

  const linkColor = useCallback((link: GraphLink) => {
    // Path highlighting: on-path edges keep color, others fade heavily
    if (pathActive) {
      if (isLinkOnPath(link)) {
        return '#6d9eeb'  // bright accent for path edges
      }
      return 'rgba(74, 74, 94, 0.12)'  // nearly invisible for non-path
    }

    // Chain highlighting (takes priority over selection dimming)
    if (chainSet.size > 0) {
      const srcName = typeof link.source === 'object' ? link.source.name : ''
      const tgtName = typeof link.target === 'object' ? link.target.name : ''
      if (chainSet.has(srcName) && chainSet.has(tgtName)) {
        return '#6d9eeb'  // accent for chain links
      }
    }

    // Selection highlight: dim edges outside hop-radius neighborhood
    const inNeighborhood = isLinkInNeighborhood(link)
    if (inNeighborhood === false) {
      return 'rgba(74, 74, 94, 0.08)'  // nearly invisible outside neighborhood
    }

    if (link.causalClassification === MENTIONED_IN_CLASSIFICATION) return MENTIONED_IN_COLOR
    return CAUSAL_COLORS[link.causalClassification] || '#4a4a5e'
  }, [pathActive, isLinkOnPath, chainSet, isLinkInNeighborhood])

  // Edge width by magnitude (MENTIONED_IN = thin)
  // Chain-highlighted and path-highlighted links get extra width
  const linkWidth = useCallback((link: GraphLink) => {
    // Path highlighting: on-path edges get thick, others get thin
    if (pathActive) {
      return isLinkOnPath(link) ? 3 : 0.3
    }

    // Chain highlighting (takes priority over selection dimming)
    if (chainSet.size > 0) {
      const srcName = typeof link.source === 'object' ? link.source.name : ''
      const tgtName = typeof link.target === 'object' ? link.target.name : ''
      if (chainSet.has(srcName) && chainSet.has(tgtName)) {
        return 3  // thicker for chain links
      }
    }

    // Selection highlight: thin edges outside hop-radius neighborhood
    const inNeighborhood = isLinkInNeighborhood(link)
    if (inNeighborhood === false) {
      return 0.3
    }

    if (link.causalClassification === MENTIONED_IN_CLASSIFICATION) return MENTIONED_IN_WIDTH
    return MAGNITUDE_WIDTH[link.magnitude] || 1
  }, [pathActive, isLinkOnPath, chainSet, isLinkInNeighborhood])

  // Edge curvature for parallel edges (Task 3.11)
  const linkCurvature = useCallback((link: GraphLink) => {
    return link.__curvature
  }, [])

  // Edge dash pattern by evidenceStrength (MENTIONED_IN = dashed)
  const linkLineDash = useCallback((link: GraphLink) => {
    if (link.causalClassification === MENTIONED_IN_CLASSIFICATION) return MENTIONED_IN_DASH
    return EVIDENCE_DASH[link.evidenceStrength] || []
  }, [])

  // Arrow length (no arrows for MENTIONED_IN — structural, not directional)
  const linkArrowLength = useCallback((link: GraphLink) => {
    if (link.causalClassification === MENTIONED_IN_CLASSIFICATION) return 0
    return ARROW_LENGTH
  }, [])

  // Hover handler
  const hoverNode = useSelectionStore(s => s.hoverNode)
  const handleNodeHover = useCallback((node: GraphNode | null) => {
    hoverNode(node)
  }, [hoverNode])

  // Background click → clear all (single click)
  const clearAll = useSelectionStore(s => s.clearAll)
  const handleBackgroundClick = useCallback(() => {
    clearAll()
  }, [clearAll])

  // Double-click on canvas background → clear all selection + path + chain
  // react-force-graph-2d captures dblclick for zoom, so onBackgroundClick doesn't fire on double-click.
  // We use onBackgroundRightClick won't work either, so native dblclick on the container.
  // Guard: skip if a node was just clicked (within 300ms) to avoid clearing on node double-click.
  const lastNodeClickTime = useRef(0)
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  const clearPath = useGraphStore(s => s.clearPath)
  const clearChain = useGraphStore(s => s.clearChain)

  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    const handleDblClick = () => {
      // If a node was clicked very recently, this double-click was on a node — don't clear
      if (Date.now() - lastNodeClickTime.current < 300) return
      clearAll()
      clearPath()
      clearChain()
    }
    el.addEventListener('dblclick', handleDblClick)
    return () => el.removeEventListener('dblclick', handleDblClick)
  }, [clearAll, clearPath, clearChain])

  // Track zoom level for StatusBar
  const setCurrentZoom = useUIStore(s => s.setCurrentZoom)
  const handleZoom = useCallback(({ k }: { k: number }) => {
    setCurrentZoom(k)
  }, [setCurrentZoom])

  // Pin node after drag
  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    node.fx = node.x
    node.fy = node.y
  }, [])

  // Node click → selection store (Phase 5)
  const selectNode = useSelectionStore(s => s.selectNode)
  const handleNodeClick = useCallback((node: GraphNode) => {
    lastNodeClickTime.current = Date.now()
    selectNode(node)
  }, [selectNode])

  // Edge hover → tooltip (Phase 7)
  const handleLinkHover = useCallback((link: GraphLink | null) => {
    if (link && fgRef.current) {
      const sourceNode = typeof link.source === 'object' ? link.source : null
      const targetNode = typeof link.target === 'object' ? link.target : null
      if (sourceNode && targetNode && sourceNode.x != null && targetNode.x != null) {
        const midX = ((sourceNode.x ?? 0) + (targetNode.x ?? 0)) / 2
        const midY = ((sourceNode.y ?? 0) + (targetNode.y ?? 0)) / 2
        const screen = fgRef.current.graph2ScreenCoords(midX, midY)
        const isMI = link.causalClassification === MENTIONED_IN_CLASSIFICATION
        setEdgeTooltip({
          x: screen.x,
          y: screen.y,
          relType: isMI ? 'Member of' : link.relType,
          causalClassification: isMI ? 'membership' : link.causalClassification,
          description: link.description,
          evidenceStrength: isMI ? '' : link.evidenceStrength,
          magnitude: isMI ? '' : link.magnitude,
          sourceName: sourceNode.name,
          targetName: targetNode.name,
        })
      }
    } else {
      setEdgeTooltip(null)
    }
  }, [])

  // Right-click → scroll LSB to relevant section (Task 4.14)
  const scrollToLsbSection = useGraphStore(s => s.scrollToLsbSection)
  const handleNodeRightClick = useCallback((node: GraphNode, event: MouseEvent) => {
    event.preventDefault()
    if (node.__type === 'project') {
      scrollToLsbSection('lsb-projects')
    } else if (node.__bridgeTier !== 'none') {
      scrollToLsbSection('lsb-bridges')
    } else {
      scrollToLsbSection('lsb-categories')
    }
  }, [scrollToLsbSection])

  return (
    <div ref={canvasContainerRef} style={{ width, height }}>
    <ForceGraph2D
      ref={fgRef}
      graphData={graphData}
      width={width}
      height={height}
      // Custom node rendering (Phase 3)
      nodeCanvasObject={paintNode}
      nodeCanvasObjectMode={() => 'replace'}
      nodePointerAreaPaint={paintHitArea}
      // Edge rendering
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkCurvature={linkCurvature}
      linkLineDash={linkLineDash}
      linkDirectionalArrowLength={linkArrowLength}
      linkDirectionalArrowRelPos={ARROW_REL_POS}
      backgroundColor="#0a0a0f"
      // Behavior
      enableNodeDrag={true}
      onNodeClick={handleNodeClick}
      onNodeRightClick={handleNodeRightClick}
      onNodeHover={handleNodeHover}
      onBackgroundClick={handleBackgroundClick}
      onNodeDragEnd={handleNodeDragEnd}
      onLinkHover={handleLinkHover}
      onZoom={handleZoom}
      autoPauseRedraw={true}
      warmupTicks={FORCE_CONFIG.warmupTicks}
      cooldownTime={FORCE_CONFIG.cooldownTime}
      d3AlphaDecay={FORCE_CONFIG.alphaDecay}
      d3VelocityDecay={FORCE_CONFIG.velocityDecay}
    />
    {edgeTooltip && <EdgeTooltip data={edgeTooltip} />}
    </div>
  )
}
