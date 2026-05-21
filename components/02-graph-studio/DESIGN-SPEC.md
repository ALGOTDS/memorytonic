# Component 02: Graph Studio — Complete Design Specification

**Status:** LOCKED (Design Complete, Build Not Started)
**Author:** Design session 2026-04-06
**Depends on:** Component 01: Ingestion (CLOSED)
**Reads from:** Neo4j (bolt://localhost:7687, database: memorytonic)

---

## Table of Contents

1. [What Graph Studio Is](#1-what-graph-studio-is)
2. [Layout Architecture](#2-layout-architecture)
3. [Data Flow — Neo4j to Pixels](#3-data-flow--neo4j-to-pixels)
4. [Canvas — The Graph](#4-canvas--the-graph)
5. [Left Sidebar (LSB) — Controls](#5-left-sidebar-lsb--controls)
6. [Right Sidebar (RSB) — Multi-Card Inspector](#6-right-sidebar-rsb--multi-card-inspector)
7. [Interaction Model](#7-interaction-model)
8. [Filter Pipeline](#8-filter-pipeline)
9. [Node Rendering Pipeline](#9-node-rendering-pipeline)
10. [Edge Rendering Pipeline](#10-edge-rendering-pipeline)
11. [Search System](#11-search-system)
12. [Path Finder](#12-path-finder)
13. [Export System](#13-export-system)
14. [Zustand Stores — State Architecture](#14-zustand-stores--state-architecture)
15. [Neo4j Queries — Complete Mapping](#15-neo4j-queries--complete-mapping)
16. [Color System](#16-color-system)
17. [Performance Contract](#17-performance-contract)
18. [File Structure](#18-file-structure)
19. [Build Phases](#19-build-phases)
20. [Decisions Log (Component 02)](#20-decisions-log-component-02)
21. [Definition of Done](#21-definition-of-done)
22. [Traps](#22-traps)

---

## 1. What Graph Studio Is

The visualization layer for MemoryTonic. It renders the knowledge graph that Component 01 built. A user opens Graph Studio, sees their research as an interactive force-directed graph, clicks entities to understand connections, uses filters to focus, and finds paths between ideas.

**One sentence:** Click a collection, see your research as a living graph, explore entities and how they connect.

**What it is NOT:**
- Not an editor (cannot modify graph data)
- Not an importer (cannot ingest new documents)
- Not a standalone app (will be embedded in Component 03: Frontend)

**Data scope:** Collection-level. The graph shows all entities and edges within one collection ("Global Finance Systems" is the test collection with 287 entities, 217 RELATES_TO edges, 450 SIMILAR_TO edges, 24 causal chains, 41 bridges across 7 projects).

---

## 2. Layout Architecture

```
┌──────────────────────────────────────────────────────────┐
│  [Collection: Global Finance Systems]    [Node: 287 | Edge: 217]  │  ← Status Bar (top)
├────────────┬───────────────────────────────┬─────────────┤
│            │                               │             │
│   LEFT     │                               │   RIGHT     │
│   SIDEBAR  │         CANVAS                │   SIDEBAR   │
│   (LSB)    │    (Force-Directed Graph)      │   (RSB)     │
│            │                               │             │
│  280px     │      flex (remaining)          │  360px      │
│  fixed     │                               │  opens on   │
│            │                               │  click       │
│  Scrolls   │                               │  Scrolls    │
│  vertically│                     [Legend]   │  vertically │
│            │                     [Minimap?] │             │
│            │                               │             │
├────────────┴───────────────────────────────┴─────────────┤
│  [Search Result Count] [Active Filters Summary]           │  ← Footer (optional)
└──────────────────────────────────────────────────────────┘
```

### Panel Behavior

| Panel | Width | Default State | Opens When | Closes When |
|-------|-------|--------------|------------|-------------|
| **LSB** | 280px fixed | Open | Always open on load | Never closes (always visible) |
| **RSB** | 360px fixed | Closed | User clicks a node on canvas | Background click or Escape |
| **Canvas** | Remaining space | Full width minus LSB | Always visible | Never |
| **Status Bar** | Full width, 32px | Visible | Always | Never |
| **Legend** | 120x auto, floating bottom-left of canvas | Visible | Always | Never |

### Responsive Rules

- Minimum window width: 1024px (LSB 280 + Canvas 384 + RSB 360)
- When RSB opens, canvas shrinks. Graph re-renders in available space.
- LSB and RSB do NOT overlay the canvas. They push it.

---

## 3. Data Flow — Neo4j to Pixels

This is the complete data journey. Every piece of data shown in the UI traces back to a specific Neo4j query, through a specific store, into a specific component.

```
NEO4J DATABASE (memorytonic)
       │
       │  bolt://localhost:7687
       │  neo4j-driver (JavaScript)
       │
       ▼
┌─────────────────────────────┐
│   services/neo4j.ts         │  ← Driver singleton
│   services/queries.ts       │  ← Named query functions
│   services/transforms.ts    │  ← Neo4j records → TypeScript types
└──────────┬──────────────────┘
           │
           │  Returns typed data
           │
           ▼
┌─────────────────────────────┐
│   ZUSTAND STORES (3)        │
│                             │
│   graph-store.ts            │  ← allNodes, allLinks, filters, filteredData
│   selection-store.ts        │  ← selectedNode, lockedNode, explorationCards, hops
│   ui-store.ts               │  ← sidebar state, path mode, search query
└──────────┬──────────────────┘
           │
           │  React subscriptions (useStore selectors)
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│   COMPONENTS                                             │
│                                                          │
│   GraphCanvas.tsx ← graph-store.filteredNodes/Links      │
│                     selection-store.selectedNode          │
│                     selection-store.lockedNode            │
│                     selection-store.hopRadius             │
│                     graph-store.highlightedPath           │
│                                                          │
│   LeftSidebar.tsx ← graph-store.categoryFilter           │
│                     graph-store.bridgeFilter              │
│                     graph-store.projectFilter             │
│                     graph-store.bandwidthRange            │
│                     ui-store.searchQuery                  │
│                                                          │
│   RightSidebar.tsx ← selection-store.lockedNode          │
│                      selection-store.explorationCards     │
│                      selection-store.entityDetails (Map)  │
└─────────────────────────────────────────────────────────┘
```

### Data Load Sequence (On Collection Open)

```
1. App mounts
2. graph-store.loadCollection("Global Finance Systems") fires
3. services/queries.ts → fetchCollectionGraph(collectionName)
   │
   │  CYPHER:
   │  MATCH (p:Project)-[:BELONGS_TO]->(c:Collection {name: $collectionName})
   │  MATCH (e:Entity)-[:MENTIONED_IN]->(p)
   │  WITH collect(DISTINCT e) AS entities
   │  UNWIND entities AS e1
   │  OPTIONAL MATCH (e1)-[r:RELATES_TO]->(e2) WHERE e2 IN entities
   │  RETURN e1, r, e2
   │
4. services/transforms.ts → deduplicate nodes, convert Neo4j Integers,
   │  compute composite importance score, assign bridge tiers,
   │  compute node size levels, detect parallel edges → assign curvature
   │
5. graph-store sets: allNodes (287), allLinks (217)
6. graph-store computes: filteredNodes, filteredLinks (initially = all)
7. GraphCanvas receives filteredNodes/filteredLinks via selector → renders
8. LSB receives filter state → renders controls
9. Canvas shows 287 nodes, force simulation starts
```

### Data Load on Entity Click

```
1. User clicks node on canvas
2. selection-store.selectNode(node) fires
3. IF entity detail not cached:
   │  services/queries.ts → fetchEntityDetail(entityName)
   │
   │  CYPHER: Fetches definition, per-project roles, relationships,
   │  causal chains, similar entities — ALL IN ONE QUERY
   │
4. selection-store.entityDetails.set(entityName, detail)
5. RSB opens → renders EntityCard with full data
```

### Data Load on Exploration Click (Locked Mode)

```
1. Primary node locked (e.g., IMF)
2. User clicks another node (e.g., OPEC) on canvas
3. selection-store.addExplorationCard(opecNode) fires
4. IF OPEC detail not cached → fetch from Neo4j
5. services/transforms.ts → computeScopedCard(opecDetail, imfDetail)
   │
   │  Computes:
   │  - Relationship between OPEC and IMF (from RELATES_TO)
   │  - OPEC's role in shared projects (from MENTIONED_IN)
   │  - Shared connections (intersection of neighbor sets)
   │  - OPEC-only connections (OPEC neighbors minus IMF neighbors)
   │
6. RSB adds new collapsible card below locked card
7. Canvas adds selection ring on OPEC
```

---

## 4. Canvas — The Graph

### Library

`react-force-graph-2d` — Canvas-based 2D force-directed graph using d3-force.

### Force Configuration

```typescript
// Applied via fgRef.current.d3Force()
charge:   strength(-120)        // Repulsion between nodes
link:     distance(60)          // Preferred edge length
collide:  radius(node => node.__radius + 2)  // Prevent overlap
center:   strength(0.05)        // Gentle pull toward center
```

### Canvas Props

| Prop | Value | Why |
|------|-------|-----|
| `graphData` | `{ nodes: filteredNodes, links: filteredLinks }` | Memoized, new refs on filter change |
| `nodeCanvasObject` | `useNodePainter()` hook | Custom rendering (see Section 9) |
| `nodeCanvasObjectMode` | `'replace'` | Full custom painting |
| `nodePointerAreaPaint` | Hit-test circle matching visual radius | Required when using replace mode |
| `linkColor` | By causalClassification | 15-color mapping |
| `linkWidth` | By magnitude | foundational=2.5, significant=1.5, marginal=0.8 |
| `linkDirectionalArrowLength` | 4 | Small directional arrows |
| `linkDirectionalArrowRelPos` | 0.75 | Arrow near target |
| `linkCurvature` | Per-link (0 default, 0.2/-0.2 for parallel) | Parallel edge separation |
| `backgroundColor` | `'#0a0a0f'` | Near-black |
| `onNodeClick` | Selection handler | Opens RSB or adds exploration card |
| `onNodeHover` | Hover handler | Canvas cursor + tooltip |
| `onNodeRightClick` | Right-click handler | LSB section uncollapse |
| `onBackgroundClick` | Clear handler | Clears selection, closes RSB |
| `onZoom` | Zoom handler | LOD recalculation |
| `enableNodeDrag` | `true` | Drag to reposition |
| `onNodeDragEnd` | Pin handler | `node.fx = node.x; node.fy = node.y` |
| `autoPauseRedraw` | `true` | Performance: pause when sim halts |
| `warmupTicks` | 50 | Pre-render 50 ticks before display |
| `cooldownTime` | 10000 | 10s sim time |
| `d3AlphaDecay` | 0.02 | Slightly slower cooling for organic layout |
| `d3VelocityDecay` | 0.3 | Moderate friction |

### Floating Canvas Elements

Two elements float on top of the canvas (positioned absolute, not part of the graph):

**1. Legend (bottom-left of canvas area)**
```
┌─ Legend ──────────────┐
│ ● Person              │  ← Each row is clickable (toggles category)
│ ● Organization        │
│ ● Place               │
│ ● Event               │
│ ● Concept             │
│ ... (14 categories)   │
│                       │
│ ◉ Gold Bridge         │
│ ◎ Silver Bridge       │
│ ○ Bronze Bridge       │
└───────────────────────┘
```
- Clicking a category dot toggles it in `graph-store.categoryFilter`
- Visual feedback: disabled categories show grey dot with strikethrough text
- Legend mirrors LSB category filter state (they are the same data)

**2. Minimap (bottom-right of canvas area) — IF EASY**

Small (150x100px) overview showing only project nodes as colored dots. A bright rectangle shows the current viewport. Click to jump. Drag rectangle to pan.

Shows only project nodes (7 dots) — keeps it clean and simple.
Skip if implementation is complex. This is a "next version" candidate.

---

## 5. Left Sidebar (LSB) — Controls

The LSB is ONE scrollable panel with collapsible sections. Not tabs. Not pages. Scroll down = more controls.

### Section Layout (top to bottom)

```
┌─── LEFT SIDEBAR ───────────────┐
│                                 │
│  📊 Collection                  │  ← Section 1: Header
│  Global Finance Systems         │
│  287 entities | 217 edges       │
│  7 projects                     │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  🔍 Search                      │  ← Section 2: Search
│  ┌─────────────────────────┐   │
│  │ Search entities...       │   │
│  └─────────────────────────┘   │
│  (results appear here)         │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  ▼ Importance                   │  ← Section 3: Bandwidth Slider
│  ┌──────────●────────●──────┐  │
│  │  20 ──────────── 100     │  │
│  └──────────────────────────┘  │
│  Showing: 243 / 287 entities   │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  ▼ Projects                     │  ← Section 4: Project Filter
│  ☑ Petrodollar System           │
│  ☑ Bretton Woods                │
│  ☑ Central Banks                │
│  ☑ Water Privatization          │
│  ☑ Green Revolution Trap        │
│  ☑ IMF Lender of Last Resort    │
│  ☑ Opium Finance System         │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  ▼ Categories                   │  ← Section 5: Category Filter
│  ☑ ● Person (23)               │
│  ☑ ● Organization (45)         │
│  ☑ ● Place (31)                │
│  ☑ ● Event (18)                │
│  ☑ ● Concept (52)              │
│  ☑ ● System (28)               │
│  ... (14 total)                 │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  ▼ Bridges                      │  ← Section 6: Bridge Filter
│  ☑ ◉ Gold (3+ projects): 8     │
│  ☑ ◎ Silver (2 projects): 33   │
│  ☑ ○ Bronze (high bridge): 12  │
│  ☐ No bridge: 234              │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  ▼ Edge Types                   │  ← Section 7: Edge Filter
│  ☑ CAUSES (12)                  │
│  ☑ ENABLES (28)                 │
│  ☑ BLOCKS (8)                   │
│  ☑ INFLUENCES (45)              │
│  ... (15 families)              │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  ▼ Path Finder                  │  ← Section 8: Path Mode
│  From: [none selected]          │
│  To:   [none selected]          │
│  [Find Path]                    │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  ▼ Saved Views                  │  ← Section 9: IF EASY
│  ► Overview (default)           │
│  ► Bridges Only                 │
│  ► High Influence               │
│  [+ Save Current View]          │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  [Export Collection]            │  ← Section 10: Export
│                                 │
└─────────────────────────────────┘
```

### Section Details

#### Section 1: Collection Header (always visible, not collapsible)
- **Source:** Collection name from `graph-store.collection`
- **Source:** Entity count from `graph-store.filteredNodes.length` / `graph-store.allNodes.length`
- **Source:** Edge count from `graph-store.filteredLinks.length` / `graph-store.allLinks.length`
- **Source:** Project count from `graph-store.projects.length`

#### Section 2: Search (always visible, not collapsible)
- Text input, debounced 300ms
- Triggers `services/queries.ts → fulltextSearch(query)`
- Results shown as a list below the input (name + category badge + definition snippet)
- Clicking a result: `fgRef.current.centerAt(node.x, node.y, 1000)` + `fgRef.current.zoom(6, 1000)` + select node
- Matching nodes on canvas get a bright ring (search highlight)
- **Source:** Neo4j fulltext index on entity name, definition, aliases_text

#### Section 3: Importance Bandwidth (collapsible, default OPEN)
- Two-handle range slider: min 0, max 100
- Default: 0–100 (show everything)
- Each entity has `compositeImportance` (0-100 percentile):
  ```
  raw = 0.35 × normalize(pageRank) + 0.25 × normalize(betweenness) +
        0.20 × normalize(degree) + 0.20 × normalize(projectCount)
  compositeImportance = percentile(raw) across all entities
  ```
- Dragging handles filters `graph-store.filteredNodes` in real-time
- Label: "Showing: X / Y entities"
- Project nodes are EXEMPT from this filter (always visible)
- **Source:** Computed in `services/transforms.ts` during data load

#### Section 4: Project Filter (collapsible, default OPEN)
- Checkbox per project
- All ON by default
- Unchecking a project hides all entities that ONLY appear in that project
- Entities appearing in multiple projects (bridges) stay visible if ANY of their projects is checked
- **Source:** Projects extracted during collection graph load

#### Section 5: Category Filter (collapsible, default OPEN)
- Checkbox + color dot per category
- Count of entities in that category (post-other-filters)
- All 14 ON by default
- Toggling a category toggles `graph-store.categoryFilter` Set
- SYNCED with Legend on canvas (same data source)
- **Source:** `entity.category` from Neo4j

#### Section 6: Bridge Filter (collapsible, default OPEN)
- Four options: Gold, Silver, Bronze, No Bridge
- All ON by default
- Toggling hides/shows entities by bridge tier
- **Source:** Bridge tier computed from `entity.projectCount` and `entity.betweenness`
  - Gold: projectCount >= 3
  - Silver: projectCount == 2
  - Bronze: projectCount == 1 AND betweenness > 75th percentile
  - No Bridge: everything else

#### Section 7: Edge Types (collapsible, default COLLAPSED)
- Checkbox per causalClassification family (15)
- Count of edges per family
- All ON by default
- Unchecking hides edges of that family (nodes stay, just those edges disappear)
- **Source:** `relationship.causalClassification` from Neo4j

#### Section 8: Path Finder (collapsible, default COLLAPSED)
- Two entity name inputs (From / To) with autocomplete
- "Find Path" button (disabled until both filled)
- Can add more entities: "Add another entity" link adds a third input
- Supports 2+ entities: finds pairwise shortest paths
- Results displayed as entity chain with relationship labels
- Active path: highlighted on canvas (bright edges + nodes, rest dimmed)
- Clear path: button to exit path highlight mode
- **Source:** `services/queries.ts → findShortestPath(entityA, entityB)` for each pair

#### Section 9: Saved Views (collapsible, default COLLAPSED) — IF EASY
- List of named views
- 3 starter views pre-loaded:
  - **Overview** — all filters default (everything visible)
  - **Bridges Only** — only Gold + Silver bridge tier visible
  - **High Influence** — bandwidth slider at 70-100
- Each view saves: bandwidthRange, categoryFilter, bridgeFilter, projectFilter, edgeTypeFilter, zoom level, pan position
- "Save Current View" button: prompts for name, saves to localStorage
- Click a view name: restores all saved state
- **Implementation:** localStorage JSON. No Neo4j involved. Skip if adds complexity.

#### Section 10: Export (always visible at bottom)
- Single button: "Export Collection"
- Triggers export flow (see Section 13)

### Right-Click → LSB Uncollapse

When user right-clicks a node on the canvas:
1. The LSB scrolls to the relevant section
2. That section uncolllapses if collapsed
3. Relevant data is highlighted

Mapping:
- Right-click any entity → LSB scrolls to "Categories" section, highlights that entity's category
- Right-click a bridge entity → LSB scrolls to "Bridges" section, highlights that tier
- Right-click during path mode → Entity added to path finder inputs

This avoids a floating context menu. The LSB IS the context panel.

---

## 6. Right Sidebar (RSB) — Multi-Card Inspector

The RSB is the research panel. It shows entity information in a stacked, collapsible card system.

### States

| State | What Shows |
|-------|-----------|
| **Closed** | Nothing. Canvas gets full remaining width. |
| **Single card (unlocked)** | One entity/project/collection card. Clicking another node replaces it. |
| **Multi-card (locked)** | Primary card locked at top + exploration cards stacking below. Clicking nodes adds scoped cards. |

### RSB opens when:
- User clicks a node on the canvas
- User clicks a search result in the LSB
- User clicks a connection in an existing card

### RSB closes when:
- User clicks the canvas background
- User presses Escape

### Multi-Card Stack Architecture

```
┌─── RSB (360px) ────────────────────────┐
│                                         │
│  🔒 [Entity Name] ▼     (LOCKED)       │  ← Primary Card (full, collapsible)
│  ┌─────────────────────────────────┐   │
│  │  [Full Entity Card]             │   │
│  │  (see Primary Card anatomy)     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Entity B] (via [Locked]) — CAUSES ▶  │  ← Exploration Card 1 (collapsed)
│  ─────────────────────────────────────  │
│                                         │
│  [Entity C] (via [Locked]) — ENABLES ▼ │  ← Exploration Card 2 (expanded)
│  ┌─────────────────────────────────┐   │
│  │  [Scoped Card]                  │   │
│  │  (see Exploration Card anatomy) │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Entity D] (via [Locked]) — BLOCKS ▶  │  ← Exploration Card 3 (collapsed)
│  ─────────────────────────────────────  │
│                                         │
└─────────────────────────────────────────┘
```

### Primary Card Anatomy (Full Entity Card)

Shows when a node is clicked. This is the complete entity profile.

```
┌─────────────────────────────────────────┐
│  🔒 / 🔓   [Lock Toggle]               │
│                                         │
│  ┌──────┐  IMF                          │
│  │ Org  │  International Monetary Fund  │
│  └──────┘  Also: The Fund               │
│            ← Category badge + Name       │
│              + Aliases                   │
│                                         │
│  ── Metrics ──────────────────────────  │
│  Influence: ████████░░ High             │
│  Bridge Score: ███░░░░░ Medium          │
│  Connections: 14                        │
│  Cross-Document: 5 projects  [GOLD]     │
│                                         │
│  ── Definition ───────────────────────  │
│  The International Monetary Fund is a   │
│  financial institution that provides    │
│  monetary cooperation and financial     │
│  stability worldwide...                 │
│                                         │
│  ── Hops ─────────────────────────────  │
│  [-] 2 [+]                              │
│                                         │
│  ── Roles by Project ─────────────────  │
│  ▼ Petrodollar System (expanded)        │
│    "Enforcer of dollar-based lending    │
│     conditionality that maintains       │
│     petrodollar recycling. Uses SAPs    │
│     to force dollar-denominated debt    │
│     structures on developing nations,   │
│     ensuring continued demand for USD." │
│                                         │
│  ▼ IMF: Lender of Last Resort           │
│    "Primary international lender that   │
│     provides emergency liquidity with   │
│     policy reform conditions attached." │
│                                         │
│  ▶ Bretton Woods (collapsed)            │
│  ▶ Central Banks (collapsed)            │
│  ▶ Green Revolution Trap (collapsed)    │
│                                         │
│  NOTE: First 2 projects expanded by     │
│  default. Rest collapsed. Full role     │
│  text always visible for expanded       │
│  projects. Researcher can understand    │
│  the entity WITHOUT reading source      │
│  documents (per Decision D3).           │
│                                         │
│  ── Connections (14) ─────────────────  │
│  ● Federal Reserve    COOPERATES_WITH   │  ← Click → adds exploration card
│  ● OPEC               REGULATES         │
│  ● World Bank          COOPERATES_WITH  │
│  ● Petrodollar System  INFLUENCES       │
│  ... (scrollable)                       │
│                                         │
│  ── Causal Chains ────────────────────  │
│  ▶ Dollar Hegemony Chain (3 links)      │
│  ▶ Debt Trap Mechanism (4 links)        │
│                                         │
│  ── Similar Entities ─────────────────  │
│  World Bank (0.87)                      │
│  Asian Development Bank (0.74)          │
│  Federal Reserve (0.71)                 │
│                                         │
└─────────────────────────────────────────┘
```

#### Data → UI Mapping for Primary Card

| UI Element | Neo4j Source | Query |
|-----------|-------------|-------|
| Name | `entity.name` | fetchEntityDetail |
| Category badge | `entity.category` | fetchEntityDetail |
| Aliases | `entity.aliases[]` | fetchEntityDetail |
| Influence bar | `entity.pageRank` → see normalization formula below | fetchEntityDetail |
| Bridge Score bar | `entity.betweenness` → see normalization formula below | fetchEntityDetail |
| Connections count | `entity.degree` (raw number) | fetchEntityDetail |
| Cross-Document | `entity.projectCount` (raw number) | fetchEntityDetail |
| Bridge tier badge | Computed from projectCount (Gold/Silver/Bronze) | Computed client-side |
| Definition | `entity.definition` | fetchEntityDetail |
| Per-project roles | `MENTIONED_IN.role` for each project. **All roles expanded by default** — first project open, rest collapsed. Full text visible without clicking. | fetchEntityDetail (returns projects[]) |
| Connections list | `RELATES_TO` relationships. Each row: entity name + relType + causalClassification badge + evidenceStrength badge. Click row to expand description. | fetchEntityDetail (returns relationships[]) |
| Causal chains | `CHAIN_LINK` relationships grouped by chainId | fetchEntityDetail (returns chainLinks[]) |
| Similar entities | `SIMILAR_TO` relationships | fetchEntityDetail (returns similar[]) |

#### Metric Labels (GDS → Human Language)

| GDS Property | User-Facing Label | Tooltip |
|-------------|-------------------|---------|
| `pageRank` | **Influence** | "How central this entity is across all connections" |
| `betweenness` | **Bridge Score** | "How often this entity sits on the shortest path between others" |
| `degree` | **Connections** | "Number of direct relationships" |
| `projectCount` | **Cross-Document** | "Number of research documents mentioning this entity" |

#### Metric Bar Normalization

Metrics displayed as horizontal bars (0-10 scale) with text label. NOT raw numbers. Users never see "pageRank: 5.22" — they see "Influence: High".

**Formula for bar value (0-10):**
```
barValue = Math.round(percentileRank(metricValue, allValuesForThatMetric) / 10)
```

So a bar of 8/10 means this entity is in the 80th percentile for that metric within the collection.

**Text labels by bar value:**
| Bar Value | Text Label |
|-----------|-----------|
| 0-2 | Low |
| 3-4 | Medium-Low |
| 5-6 | Medium |
| 7-8 | High |
| 9-10 | Very High |

**Example:** IMF has pageRank=5.22 (highest in collection → 100th percentile → bar=10 → "Very High"). A marginal entity with pageRank=0.15 (5th percentile → bar=1 → "Low").

#### Evidence and Evidence Strength Display

Evidence fields appear in TWO places:

1. **Connections list (Primary Card):** Each connection row shows an `evidenceStrength` badge (small chip: "established" / "claimed" / "disputed" / "speculative"). Click to expand → shows full `evidence` quote and `description`.

2. **Edge hover tooltip (Canvas):** Shows `relType`, `causalClassification`, `description`, and `evidenceStrength` badge. Does NOT show full evidence quote (too long for tooltip).

Evidence strength badge colors:
```
established: #22C55E (green)
claimed:     #60A5FA (blue)
disputed:    #F59E0B (amber)
speculative: #9CA3AF (grey)
```

### Exploration Card Anatomy (Scoped Card)

Shows when a node is clicked while another node is locked. This card is scoped to the locked entity's perspective.

```
┌─────────────────────────────────────────┐
│  ✕  OPEC (via IMF) — REGULATES    ▼/▶  │  ← Header (always visible)
│                                         │
│  ── LEVEL 1: Always Visible ──────────  │
│                                         │
│  ★ Relationship to IMF:                 │
│    REGULATES — "IMF monitors oil price  │
│    impact on currency stability and     │
│    imposes structural adjustment..."    │
│                                         │
│  Role (in Petrodollar System):          │
│    "Cartel controlling oil pricing      │
│    denominated in US dollars,           │
│    maintaining petrodollar recycling    │
│    through production quotas..."        │
│                                         │
│  Definition:                            │
│    Organization of the Petroleum        │
│    Exporting Countries...               │
│                                         │
│  ── LEVEL 2: More Details (expand) ──── │
│  ▸ More details                         │
│                                         │
│    Category: Organization               │
│    Influence: ██████░░░░ Medium          │
│    Projects: Petrodollar System,        │
│              Oil Crisis 1973            │
│                                         │
│    Shared with IMF:                     │
│      ● Federal Reserve                  │
│      ● Saudi Arabia                     │
│      ● Petrodollar System               │
│                                         │
│    OPEC-only connections:               │
│      ● Oil Markets                      │
│      ● Venezuela                        │
│      ● Production Quotas                │
│                                         │
└─────────────────────────────────────────┘
```

#### Collapsed Header Line

When an exploration card is collapsed, only the header shows:
```
✕  OPEC (via IMF) — REGULATES  ▶
```

This one line contains: close button, entity name, scope indicator, relationship type, expand arrow. Enough to scan the stack without expanding.

#### Data → UI Mapping for Exploration Card

| UI Element | Source | How Computed |
|-----------|--------|-------------|
| Relationship to locked | `RELATES_TO` between this entity and locked entity | Filter from entity detail's relationships[] |
| Relationship description | `RELATES_TO.description` | From the same edge |
| Role in scope | `MENTIONED_IN.role` for a shared project | From entity detail's projects[], pick first shared project with locked entity |
| Definition | `entity.definition` | From entity detail |
| Shared connections | Intersection of this entity's neighbors and locked entity's neighbors | Client-side set intersection |
| Entity-only connections | This entity's neighbors minus locked entity's neighbors | Client-side set difference |
| Category, metrics | `entity.category`, `entity.pageRank`, etc. | From entity detail |
| Projects | `MENTIONED_IN` relationships | From entity detail |

#### Multi-Card Interaction Rules

| Action | Result |
|--------|--------|
| Click node while unlocked | RSB opens/replaces with that node's full card |
| Click lock icon 🔒 | Locks current primary card. Future clicks add exploration cards |
| Click node while locked | New exploration card ADDED to stack (collapsed by default) |
| Click ✕ on exploration card | Removes that card only |
| Click connection name in primary card's connections list | Adds exploration card for that entity (same as clicking on canvas) |
| Click connection name in exploration card | Navigates: that entity becomes new primary, lock releases, stack clears |
| Click unlock icon 🔓 | Releases lock, clears all exploration cards, back to single-card mode |
| Click canvas background | Closes RSB entirely |
| Expand/collapse card | Toggle ▼/▶ on that card. Only one or two expanded at a time is natural but not enforced |

### Project Card

When a project node is clicked (not an entity):

```
┌─────────────────────────────────────────┐
│  📄 Petrodollar System                  │
│                                         │
│  Domain: Geopolitics > Energy Finance   │
│  Tags: oil, dollar, hegemony, OPEC      │
│                                         │
│  Summary:                               │
│  The petrodollar system describes the   │
│  agreement between the United States    │
│  and Saudi Arabia...                    │
│  (200+ words)                           │
│                                         │
│  Narrative Flow:                        │
│  1. 1971 Nixon Shock ends gold standard │
│  2. 1973 Oil Crisis creates leverage    │
│  3. 1974 US-Saudi agreement             │
│  ...                                    │
│                                         │
│  Entities: 36                           │
│  Relationships: 26                      │
│  Causal Chains: 3                       │
│                                         │
│  [View Full Document]                   │  ← Opens HTML in browser
│                                         │
└─────────────────────────────────────────┘
```

Project cards are NOT part of the multi-card lock system. They're standalone. Clicking a project always replaces the RSB with a project card (not stackable).

### Collection Card

When the collection header in LSB is clicked:

```
┌─────────────────────────────────────────┐
│  📊 Global Finance Systems              │
│                                         │
│  Projects: 7                            │
│  Entities: 287                          │
│  Relationships: 217                     │
│  Causal Chains: 24                      │
│  Bridge Entities: 41                    │
│                                         │
│  Top Entities by Influence:             │
│  1. IMF (5.22)                          │
│  2. Federal Reserve (4.87)              │
│  3. World Bank (4.31)                   │
│  ...                                    │
│                                         │
│  Bridge Entities:                       │
│  GOLD: IMF, China, US, Saudi Arabia...  │
│  SILVER: Federal Reserve, OPEC...       │
│                                         │
└─────────────────────────────────────────┘
```

---

## 7. Interaction Model

Every possible user action and its result.

### Canvas Interactions

| User Action | Canvas Effect | LSB Effect | RSB Effect | Store Change |
|------------|--------------|------------|------------|-------------|
| **Click entity node (unlocked)** | Node gets selection ring. N-hop neighbors glow. Rest dims. | No change | Opens with entity's full card | `selection.selectNode(node)` |
| **Click entity node (locked)** | Node gets selection ring. Locked node's hops stay. | No change | Exploration card ADDED | `selection.addExploration(node)` |
| **Click project node** | Project gets selection ring. Its entities glow. | No change | Opens with project card | `selection.selectProject(node)` |
| **Hover entity node** | Cursor → pointer. Node brightens slightly. Tooltip: name + category. | No change | No change | `selection.hoverNode(node)` |
| **Hover edge** | Edge brightens. Tooltip: relType + description. | No change | No change | — |
| **Right-click entity node** | — | Scrolls to + uncollapses relevant section | No change | — |
| **Click canvas background** | All highlights clear. Simulation continues. | No change | RSB closes | `selection.clearAll()` |
| **Drag node** | Node follows cursor. Sim heats. | No change | No change | — |
| **Release dragged node** | Node pins at drop position (`fx`, `fy`). | No change | No change | — |
| **Scroll wheel** | Zoom in/out. LOD levels change. | No change | No change | `ui.setZoom(k)` |
| **Click + drag background** | Pan the viewport. | No change | No change | — |

### Hop Highlighting Detail

When a node is selected, its N-hop neighborhood is visually highlighted:

```
Selected Node:     Full brightness + selection ring (white, 2px)
1-hop neighbors:   90% brightness, visible labels if zoom allows
2-hop neighbors:   60% brightness (default hop = 2)
3-hop neighbors:   40% brightness (if user sets hops to 3)
Everything else:   15% brightness (dimmed, not hidden)
Edges within hops: Full brightness + slight glow
Edges outside:     10% opacity (barely visible)
```

The hop radius is controlled by [-] [+] buttons in the RSB card header.

**Default:** 2 hops.
**Range:** 1 to 3.

### Locked Mode Canvas Behavior

When primary is locked (e.g., IMF) and exploration cards exist:

| Element | Visual Treatment |
|---------|-----------------|
| Locked entity (IMF) | Full glow + lock icon overlay + N-hop neighborhood stays |
| Expanded exploration card entity | White selection ring (2px) + edge to locked entity brightened |
| Collapsed exploration card entities | Thin selection ring (1px, 50% opacity) |
| Edges between locked ↔ any stack entity | Extra bright (highlight color) |
| Everything else | Dimmed (15% brightness) |

---

## 8. Filter Pipeline

All filters are AND-chained. An entity must pass ALL active filters to be visible. Computed client-side for instant response.

### Pipeline Order

```
allNodes (287)
     │
     ▼
[1. Project Filter]         Is entity MENTIONED_IN at least one checked project?
     │                      Project nodes always pass.
     ▼
[2. Importance Bandwidth]   Is entity's compositeImportance within the slider range?
     │                      Project nodes always pass.
     ▼
[3. Category Filter]        Is entity's category in the active set?
     │                      Project nodes always pass.
     ▼
[4. Bridge Filter]          Is entity's bridge tier in the active set?
     │
     ▼
[5. Edge Type Filter]       (Applied to links, not nodes)
     │                      Hide edges whose causalClassification is unchecked.
     │                      Nodes with zero remaining visible edges are NOT hidden —
     │                      they just appear disconnected.
     ▼
filteredNodes / filteredLinks
     │
     ▼
[6. Overlay Layer]          Search highlights, path highlights, selection highlights.
                            These OVERRIDE the dimming — a filtered-out node that
                            appears in a search result gets shown with a highlight ring.
```

### Filter → Store → Component Wiring

| Filter | Store Property | Type | Component |
|--------|---------------|------|-----------|
| Project | `graphStore.projectFilter` | `Set<string>` (project uniqueIds) | LSB → Section 4 |
| Importance | `graphStore.bandwidthRange` | `[number, number]` (0-100) | LSB → Section 3 |
| Category | `graphStore.categoryFilter` | `Set<string>` (category names) | LSB → Section 5 + Legend |
| Bridge Tier | `graphStore.bridgeFilter` | `Set<'gold'|'silver'|'bronze'|'none'>` | LSB → Section 6 |
| Edge Type | `graphStore.edgeTypeFilter` | `Set<string>` (causalClassification names) | LSB → Section 7 |

### Computed Filtered Data

```typescript
// In graph-store.ts — computed on every filter change
const filteredNodes = allNodes.filter(node => {
  if (node.__type === 'project') return true; // Projects always visible
  if (!projectFilter.has(anyProjectOf(node))) return false;
  if (node.__compositeImportance < bandwidthRange[0] ||
      node.__compositeImportance > bandwidthRange[1]) return false;
  if (!categoryFilter.has(node.category)) return false;
  if (!bridgeFilter.has(node.__bridgeTier)) return false;
  return true;
});

const filteredLinks = allLinks.filter(link => {
  const sourceVisible = filteredNodeIds.has(link.source.id || link.source);
  const targetVisible = filteredNodeIds.has(link.target.id || link.target);
  if (!sourceVisible || !targetVisible) return false;
  if (!edgeTypeFilter.has(link.causalClassification)) return false;
  return true;
});
```

### Overlay Layer (Not a Filter — Visual Override)

These don't filter nodes in/out. They add visual emphasis on top of the filtered graph:

| Overlay | Trigger | Visual Effect |
|---------|---------|--------------|
| **Search highlight** | User types in search bar | Matching nodes get bright ring. Non-matching at normal brightness. |
| **Path highlight** | Path finder returns result | Path nodes/edges at full brightness. Everything else dims to 15%. |
| **Selection highlight** | User clicks a node | Selected + N-hop at full brightness. Rest dims. |
| **Exploration stack** | Locked + clicked nodes | Locked node + all stack nodes get rings. |

**Priority:** Path > Selection > Search > Normal rendering.

---

## 9. Node Rendering Pipeline

Custom canvas painting via `nodeCanvasObject` prop. This is the visual heart of Graph Studio.

### useNodePainter Hook

Returns a `(node, ctx, globalScale) => void` callback.

Paint order (back to front, per node):

```
1. GLOW (bridge entities only)
   ├── Gold:   radialGradient, #FFD700, radius: node.__radius + 8, opacity 0.3
   ├── Silver: radialGradient, #C0C0C0, radius: node.__radius + 6, opacity 0.2
   └── Bronze: radialGradient, #CD7F32, radius: node.__radius + 4, opacity 0.15

2. BRIDGE RING (bridge entities only)
   ├── Gold:   stroke circle, #FFD700, lineWidth 2.5
   ├── Silver: stroke circle, #C0C0C0, lineWidth 2
   └── Bronze: stroke circle, #CD7F32, lineWidth 1.5

3. FILL CIRCLE
   └── ctx.arc(node.x, node.y, node.__radius, 0, 2π)
       ctx.fillStyle = CATEGORY_COLORS[node.category]

4. SELECTION RING (if selected or in exploration stack)
   ├── Selected (expanded card): white stroke, 2px
   └── In stack (collapsed card): white stroke, 1px, 50% opacity

5. SEARCH HIGHLIGHT (if node matches search)
   └── Bright ring, yellow (#FBBF24), 1.5px

6. LABEL (zoom-dependent OR forced)
   ├── IF globalScale > 1.5: show label for ALL visible nodes
   ├── IF node is project: ALWAYS show label (any zoom)
   ├── IF node.__bridgeTier === 'gold' or 'silver': ALWAYS show label
   ├── IF node.__compositeImportance >= 95: ALWAYS show label (top 5%)
   ├── IF node is hovered: ALWAYS show label
   ├── IF node is selected: ALWAYS show label
   └── Font: 12px / globalScale (inversely scaled so text stays readable)

7. DIMMING (if not in highlight set)
   └── globalAlpha = 0.15 for dimmed nodes (when selection/path active)
```

### Node Size Levels (6 Discrete)

Computed during data transform, stored as `node.__radius`:

| Level | Radius (px) | Composite Importance Percentile |
|-------|-------------|-------------------------------|
| **XS** | 4 | 0–19 |
| **S** | 6 | 20–39 |
| **M** | 8 | 40–59 |
| **L** | 12 | 60–79 |
| **XL** | 16 | 80–94 |
| **XXL** | 20 | 95–100 (top 5%) |

**Project nodes** are always **L** (12px). They're structural, not ranked.

### Composite Importance Score

Computed once during data load, per entity:

```typescript
// Step 1: Normalize each metric to 0-1 within the collection
const normalizedPR = (entity.pageRank - minPR) / (maxPR - minPR);
const normalizedBW = (entity.betweenness - minBW) / (maxBW - minBW);
const normalizedDeg = (entity.degree - minDeg) / (maxDeg - minDeg);
const normalizedPC = (entity.projectCount - 1) / (maxPC - 1);

// Step 2: Weighted combination
const raw = 0.35 * normalizedPR + 0.25 * normalizedBW +
            0.20 * normalizedDeg + 0.20 * normalizedPC;

// Step 3: Convert to percentile (0-100) across all entities
entity.__compositeImportance = percentileRank(raw, allRawScores);

// Step 4: Map percentile to size level
entity.__sizeLevel = compositeImportance < 20 ? 'xs'
  : compositeImportance < 40 ? 's'
  : compositeImportance < 60 ? 'm'
  : compositeImportance < 80 ? 'l'
  : compositeImportance < 95 ? 'xl' : 'xxl';

entity.__radius = { xs: 4, s: 6, m: 8, l: 12, xl: 16, xxl: 20 }[entity.__sizeLevel];
```

**Example Calculation (IMF):**
```
IMF: pageRank=5.22 (max in collection), betweenness=3891, degree=14, projectCount=5
Step 1: normalizedPR = (5.22-0.15)/(5.22-0.15) = 1.0
        normalizedBW = (3891-0)/(6197-0) = 0.63
        normalizedDeg = (14-1)/(14-1) = 1.0
        normalizedPC = (5-1)/(7-1) = 0.67
Step 2: raw = 0.35*1.0 + 0.25*0.63 + 0.20*1.0 + 0.20*0.67 = 0.35+0.16+0.20+0.13 = 0.84
Step 3: percentile(0.84) ≈ 98 → compositeImportance = 98
Step 4: 98 >= 95 → sizeLevel = 'xxl' → radius = 20px
```

**Weights rationale (Decision D36):**
- PageRank (0.35): Most important — measures true network influence
- Betweenness (0.25): Bridge entities are the research insight
- Degree (0.20): Raw connectivity matters
- ProjectCount (0.20): Cross-document presence is valuable

### Level of Detail (LOD) by Zoom

| globalScale | What Renders |
|-------------|-------------|
| < 0.3 | Filled rectangles (2×2px). No circles. Maximum performance. |
| 0.3 – 0.8 | Circles only. No labels. No glow. Bridge rings only for gold. |
| 0.8 – 1.5 | Circles + bridge glow/rings. Labels only for forced-label nodes (projects, gold/silver bridges, top 5%, selected, hovered). |
| 1.5 – 3.0 | Full rendering. All labels. All glow. All rings. |
| > 3.0 | Full rendering + edge labels visible on canvas (causalClassification text along edges). |

### Hit Detection

Because we use `nodeCanvasObjectMode: 'replace'`, we must also provide `nodePointerAreaPaint`:

```typescript
nodePointerAreaPaint={(node, color, ctx) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.__radius + 2, 0, 2 * Math.PI);
  ctx.fill();
}}
```

The `+2` extends the clickable area slightly beyond the visual circle for easier clicking of small nodes.

---

## 10. Edge Rendering Pipeline

### Default Edge Rendering (via props, not custom painting)

| Prop | Value | Source |
|------|-------|--------|
| `linkColor` | `CAUSAL_COLORS[link.causalClassification]` | 15-color map |
| `linkWidth` | `MAGNITUDE_WIDTH[link.magnitude]` | foundational=2.5, significant=1.5, marginal=0.8 |
| `linkDirectionalArrowLength` | 4 | Small arrows |
| `linkDirectionalArrowRelPos` | 0.75 | Arrow near target end |
| `linkCurvature` | Per-link | 0 for unique pairs, 0.2/-0.2 for parallel |
| `linkLineDash` | By evidenceStrength | established=solid, claimed=[5,3], disputed=[3,3], speculative=[2,4] |

### Parallel Edge Detection

During data transform, detect entity pairs with multiple edges (same source+target, different relType):

```typescript
// Group links by source-target pair (undirected)
const pairKey = [link.source, link.target].sort().join('|');
const pairGroups = groupBy(allLinks, pairKey);

// Assign curvature for parallel edges
pairGroups.forEach(group => {
  if (group.length === 1) { group[0].__curvature = 0; return; }
  group.forEach((link, i) => {
    link.__curvature = (i - (group.length - 1) / 2) * 0.15;
  });
});
```

### Edge Labels at High Zoom

When `globalScale > 3.0`, edge labels (causalClassification) are rendered on the canvas. This uses `linkCanvasObject` (optional — only enable at high zoom for performance):

```
Approach: At globalScale > 3.0, switch to custom linkCanvasObject
that draws the line + a text label at the midpoint showing
the causalClassification type.
```

### Edge Hover Tooltip

When hovering an edge:
- Tooltip shows: `relType: FUNDS | causalClassification: CAUSES`
- Plus: `description` (the 80+ char description from extraction)
- Plus: `evidenceStrength` badge
- Tooltip is HTML overlay positioned via `graph2ScreenCoords`

### Edge Highlighting

| State | Edge Appearance |
|-------|----------------|
| Normal | Category color, magnitude width |
| In selection's hop radius | Full brightness |
| In path highlight | Extra bright + slight width increase |
| Between locked + stack entity | Extra bright + glow |
| Outside any highlight | 10% opacity |

---

## 11. Search System

### Fulltext Search Only

Graph Studio uses Neo4j's fulltext index. No vector/semantic search (that requires Python BERT for query embedding — deferred to Component 04 MCP).

### Flow

```
User types in LSB search bar
     │
     │  Debounced 300ms
     ▼
services/queries.ts → fulltextSearch(query)
     │
     │  CYPHER:
     │  CALL db.index.fulltext.queryNodes('entity_fulltext', $searchTerm)
     │  YIELD node, score
     │  RETURN node.name, node.category, node.definition, score
     │  ORDER BY score DESC LIMIT 20
     │
     ▼
ui-store.searchResults = [{name, category, definition, score}]
     │
     ▼
LSB shows results list below search input
     │
     ▼
Canvas: matching nodes get yellow highlight ring (search overlay)
     │
     ▼
User clicks a result:
  1. graph-store → look up node by name
  2. fgRef.current.centerAt(node.x, node.y, 1000)
  3. fgRef.current.zoom(6, 1000)
  4. selection-store.selectNode(node)
  5. RSB opens with entity card
```

### Search Bar Behavior

- Placeholder: "Search entities..."
- Minimum 2 characters to trigger search
- Results show: name (bold) + category badge + definition preview (truncated)
- Clicking result → zoom + select
- Pressing Escape in search → clears results + clears search highlight
- Empty search → clears all search state

---

## 12. Path Finder

### Location

LSB Section 8 (collapsible, default collapsed).

### Single Pair Path

```
User enters Entity A name (autocomplete from allNodes)
User enters Entity B name (autocomplete from allNodes)
Clicks "Find Path"
     │
     ▼
services/queries.ts → findShortestPath(entityA, entityB)
     │
     │  CYPHER:
     │  MATCH path = shortestPath(
     │    (a:Entity {name: $entityA})-[:RELATES_TO*..6]-(b:Entity {name: $entityB})
     │  )
     │  RETURN [n IN nodes(path) | n.name] AS entities,
     │    [r IN relationships(path) | r.relType] AS relTypes
     │
     ▼
graph-store.highlightedPath = [entityName1, entityName2, ...]
     │
     ▼
Canvas: Path overlay activates
  - Path nodes: full brightness + thick ring
  - Path edges: full brightness + width boost
  - Everything else: 15% opacity (dimmed)
     │
     ▼
LSB Path section shows result:
  Entity A → (FUNDS) → Entity C → (ENABLES) → Entity B
```

### Multi-Entity Path (3+ entities)

When user clicks "Add another entity" to add a 3rd (or 4th) input:

```
For entities [A, B, C]:
  1. Find path A → B
  2. Find path B → C
  3. Find path A → C
  4. Union all paths
  5. Highlight union on canvas
  6. Common intermediaries (entities appearing in 2+ paths) get a special marker
```

This is pairwise shortest paths. For 3 entities = 3 queries. For 4 = 6 queries. Cap at 5 entities max (10 queries).

### Path Results Display (in LSB)

```
┌── Path Results ─────────────────────┐
│                                      │
│  IMF → Federal Reserve (2 hops)      │
│  IMF → (COOPERATES) → Fed            │
│                                      │
│  IMF → OPEC (3 hops)                 │
│  IMF → (REGULATES) → Petrodollar    │
│  → (DEPENDS) → OPEC                  │
│                                      │
│  Federal Reserve → OPEC (2 hops)     │
│  Fed → (INFLUENCES) → OPEC           │
│                                      │
│  Common: Petrodollar System           │
│                                      │
│  [Clear Path]                        │
└──────────────────────────────────────┘
```

### Path Mode Interaction

- While path is highlighted, clicking any node on the path → opens its card in RSB (path stays highlighted)
- Clicking "Clear Path" or pressing Escape → removes path overlay, returns to normal rendering
- Path highlight has HIGHER priority than selection highlight (if both active, path wins)

---

## 13. Export System

### What Graph Studio Exports

Graph Studio provides a UI button that triggers Component 01's `export_collection.py`. The export creates a portable ZIP containing the full collection.

### Flow

```
User clicks "Export Collection" in LSB Section 10
     │
     ▼
UI shows modal/dialog:
  "Export Global Finance Systems?"
  "This will create a portable ZIP file containing all
   7 projects, 287 entities, and their connections."
  [Export] [Cancel]
     │
     ▼
On confirm: spawn child process
  python components/01-ingestion/neo4j/export_collection.py "Global Finance Systems"
     │
     ▼
Progress indicator in UI (indeterminate, process takes ~5-15 seconds)
     │
     ▼
On success: Show file path
  "Exported to: components/01-ingestion/data/exports/global-finance-systems.zip"
  [Open Folder] [Done]
     │
     ▼
On error: Show error message
```

**No import in Graph Studio.** Import is handled elsewhere (CLI or future Component 03/05).

---

## 14. Zustand Stores — State Architecture

Three stores, thin and focused. No cross-store imports.

### graph-store.ts

```typescript
interface GraphStore {
  // DATA (loaded from Neo4j)
  collection: string;                          // "Global Finance Systems"
  allNodes: GraphNode[];                       // 287 entities + 7 projects
  allLinks: GraphLink[];                       // 217 RELATES_TO
  projects: ProjectSummary[];                  // 7 project stubs

  // FILTERS
  projectFilter: Set<string>;                  // Project uniqueIds (all ON)
  bandwidthRange: [number, number];            // [0, 100] default
  categoryFilter: Set<string>;                 // 14 categories (all ON)
  bridgeFilter: Set<string>;                   // 'gold'|'silver'|'bronze'|'none' (all ON)
  edgeTypeFilter: Set<string>;                 // 15 causalClassifications (all ON)

  // COMPUTED (derived from data + filters)
  filteredNodes: GraphNode[];                  // Nodes passing all filters
  filteredLinks: GraphLink[];                  // Links passing all filters

  // OVERLAYS
  searchHighlights: Set<string>;               // Entity names matching search
  highlightedPath: string[];                   // Entity names in active path

  // ACTIONS
  loadCollection: (name: string) => Promise<void>;
  toggleProject: (uniqueId: string) => void;
  setBandwidthRange: (range: [number, number]) => void;
  toggleCategory: (category: string) => void;
  toggleBridgeTier: (tier: string) => void;
  toggleEdgeType: (classification: string) => void;
  setSearchHighlights: (names: Set<string>) => void;
  setHighlightedPath: (names: string[]) => void;
  clearPath: () => void;
  recomputeFiltered: () => void;               // Called internally after any filter change
}
```

### selection-store.ts

```typescript
interface SelectionStore {
  // SELECTION STATE
  selectedNode: GraphNode | null;              // Currently selected (ring on canvas)
  hoveredNode: GraphNode | null;               // Currently hovered (tooltip)
  lockedNode: GraphNode | null;                // Locked primary (null = unlocked)
  hopRadius: number;                           // 1-3, default 2

  // MULTI-CARD STATE
  explorationStack: ExplorationCard[];         // Scoped cards below locked primary
  entityDetails: Map<string, EntityDetail>;    // Cache: name → fetched detail

  // ACTIONS
  selectNode: (node: GraphNode) => void;       // Click handler
  hoverNode: (node: GraphNode | null) => void;
  lockNode: () => void;                        // Lock current selectedNode
  unlockNode: () => void;                      // Clear lock + exploration stack
  addExplorationCard: (node: GraphNode) => void;
  removeExplorationCard: (entityName: string) => void;
  setHopRadius: (hops: number) => void;
  clearAll: () => void;                        // Background click
  navigateTo: (entityName: string) => void;    // Click connection in exploration card → new primary
}

interface ExplorationCard {
  entity: GraphNode;
  entityDetail: EntityDetail;
  relationship: RelationshipToLocked;          // Edge data between this and locked
  sharedConnections: string[];                 // Intersection of neighbor sets
  ownConnections: string[];                    // This entity's unique connections
  scopedRole: string | null;                   // Role in first shared project
  expanded: boolean;                           // UI state: expanded or collapsed
}
```

### ui-store.ts

```typescript
interface UIStore {
  // SIDEBAR STATE
  rightSidebarOpen: boolean;                   // false by default

  // SEARCH
  searchQuery: string;                         // Current search input
  searchResults: SearchResult[];               // Results from fulltext search

  // PATH MODE
  pathMode: boolean;                           // Path finder active
  pathEntities: string[];                      // Entity names in path input (2-5)
  pathResults: PathResult[];                   // Computed paths

  // ZOOM
  currentZoom: number;                         // Current globalScale

  // ACTIONS
  setRightSidebarOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  enterPathMode: () => void;
  exitPathMode: () => void;
  addPathEntity: (name: string) => void;
  removePathEntity: (name: string) => void;
  setPathResults: (results: PathResult[]) => void;
  setCurrentZoom: (zoom: number) => void;
}
```

### Type Definitions

```typescript
// types/graph.ts

interface GraphNode {
  id: string;                                  // entityId or projectId
  name: string;
  category: string;                            // 14 categories or 'project'
  definition?: string;
  aliases?: string[];

  // GDS metrics
  pageRank: number;
  betweenness: number;
  degree: number;
  projectCount: number;

  // Computed (by transforms.ts)
  __type: 'entity' | 'project';
  __compositeImportance: number;               // 0-100 percentile
  __sizeLevel: 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl';
  __radius: number;                            // 4 | 6 | 8 | 12 | 16 | 20
  __bridgeTier: 'gold' | 'silver' | 'bronze' | 'none';
  __projects: string[];                        // Project uniqueIds this entity is in
  __neighborIds: Set<string>;                  // Pre-computed neighbor set

  // d3-force managed (DO NOT SET)
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink {
  source: string | GraphNode;                  // MUTATED by d3-force
  target: string | GraphNode;
  relType: string;
  causalClassification: string;
  description: string;
  evidence?: string;
  evidenceStrength: string;
  magnitude: string;
  year?: number;
  projectId: string;

  // Computed
  __curvature: number;                         // 0 for unique pairs, offset for parallel
}

interface EntityDetail {
  name: string;
  category: string;
  definition: string;
  aliases: string[];
  pageRank: number;
  betweenness: number;
  degree: number;
  projectCount: number;
  projects: Array<{
    name: string;
    uniqueId: string;
    role: string;                              // Per-project role from MENTIONED_IN
  }>;
  relationships: Array<{
    entityName: string;
    relType: string;
    causalClassification: string;
    description: string;
    magnitude: string;
    year?: number;
  }>;
  chainLinks: Array<{
    chainId: string;
    chainName: string;
    linkedEntity: string;
    orderIndex: number;
    explanation: string;
  }>;
  similarEntities: Array<{
    name: string;
    category: string;
    similarity: number;
  }>;
}

interface SearchResult {
  name: string;
  category: string;
  definition: string;
  score: number;
}

interface PathResult {
  from: string;
  to: string;
  entities: string[];                          // Ordered nodes in path
  relTypes: string[];                          // Edge types along path
  hops: number;
}
```

---

## 15. Neo4j Queries — Complete Mapping

Every query Graph Studio makes, which service function runs it, which store it feeds, and which UI component consumes it.

### Q1: Load Collection Graph (startup)

```cypher
MATCH (p:Project)-[:BELONGS_TO]->(c:Collection {name: $collectionName})
MATCH (e:Entity)-[:MENTIONED_IN]->(p)
WITH collect(DISTINCT e) AS entities, collect(DISTINCT p) AS projects
UNWIND entities AS e1
OPTIONAL MATCH (e1)-[r:RELATES_TO]->(e2)
WHERE e2 IN entities
RETURN e1 {
  .entityId, .name, .category, .definition, .aliases,
  .pageRank, .betweenness, .degree, .projectCount
} AS entity,
r {
  .relType, .causalClassification, .description,
  .evidence, .evidenceStrength, .magnitude, .year, .projectId
} AS rel,
e2.entityId AS targetId
```

| Field | Used By |
|-------|---------|
| `entity.*` | graph-store.allNodes, Canvas node rendering |
| `rel.*` | graph-store.allLinks, Canvas edge rendering |
| Exclude: `entity.embedding[384]` | Never needed in frontend |

**Service:** `queries.ts → fetchCollectionGraph(collectionName)`
**Transform:** `transforms.ts → toGraphData(records)` — deduplicates, computes __compositeImportance, __sizeLevel, __radius, __bridgeTier, detects parallel edges
**Store:** `graph-store.allNodes`, `graph-store.allLinks`
**UI:** GraphCanvas, LSB filter counts

### Q2: Load Projects (startup, alongside Q1)

```cypher
MATCH (p:Project)-[:BELONGS_TO]->(c:Collection {name: $collectionName})
RETURN p.name, p.uniqueId, p.summary, p.domain, p.subdomain, p.baseTags, p.htmlPath
```

**Service:** `queries.ts → fetchCollectionProjects(collectionName)`
**Store:** `graph-store.projects`
**UI:** LSB project filter (Section 4), Project cards in RSB

### Q3: Fetch Entity Detail (on entity click)

```cypher
MATCH (e:Entity {name: $entityName})
OPTIONAL MATCH (e)-[m:MENTIONED_IN]->(p:Project)
OPTIONAL MATCH (e)-[r:RELATES_TO]-(other:Entity)
OPTIONAL MATCH (e)-[cl:CHAIN_LINK]-(linked:Entity)
OPTIONAL MATCH (cc:CausalChain {chainId: cl.chainId})
OPTIONAL MATCH (e)-[s:SIMILAR_TO]-(sim:Entity)
RETURN e {
  .name, .category, .definition, .aliases,
  .pageRank, .betweenness, .degree, .projectCount
} AS entity,
collect(DISTINCT {project: p.name, uniqueId: p.uniqueId, role: m.role}) AS projects,
collect(DISTINCT {
  entity: other.name, relType: r.relType,
  causalClassification: r.causalClassification,
  description: r.description, magnitude: r.magnitude, year: r.year
}) AS relationships,
collect(DISTINCT {
  chainId: cl.chainId, chainName: cc.name,
  entity: linked.name, orderIndex: cl.orderIndex, explanation: cl.explanation
}) AS chainLinks,
collect(DISTINCT {name: sim.name, category: sim.category, similarity: s.similarity}) AS similar
```

**Service:** `queries.ts → fetchEntityDetail(entityName)`
**Transform:** `transforms.ts → toEntityDetail(record)`
**Store:** `selection-store.entityDetails` (cached by name)
**UI:** RSB Primary Card, RSB Exploration Card (Level 1 + Level 2 data)

### Q4: Fulltext Search (on search input)

```cypher
CALL db.index.fulltext.queryNodes('entity_fulltext', $searchTerm)
YIELD node, score
RETURN node.name AS name, node.category AS category,
  node.definition AS definition, score
ORDER BY score DESC LIMIT 20
```

**Service:** `queries.ts → fulltextSearch(query)`
**Store:** `ui-store.searchResults`, `graph-store.searchHighlights`
**UI:** LSB search results list, Canvas search highlight ring

### Q5: Find Shortest Path (on path finder submit)

```cypher
MATCH path = shortestPath(
  (a:Entity {name: $entityA})-[:RELATES_TO*..6]-(b:Entity {name: $entityB})
)
RETURN [n IN nodes(path) | n.name] AS entities,
  [r IN relationships(path) | r.relType] AS relTypes
```

**Service:** `queries.ts → findShortestPath(entityA, entityB)`
**Store:** `graph-store.highlightedPath`, `ui-store.pathResults`
**UI:** Canvas path overlay, LSB path results display

### Q6: Fetch Causal Chains for a Project (on project card expand)

```cypher
MATCH (cc:CausalChain)-[:BELONGS_TO_PROJECT]->(p:Project {uniqueId: $uid})
MATCH (a:Entity)-[cl:CHAIN_LINK {chainId: cc.chainId}]->(b:Entity)
RETURN cc.name AS chainName, cc.description AS chainDescription,
  collect({
    source: a.name, target: b.name,
    order: cl.orderIndex, explanation: cl.explanation
  }) AS links
ORDER BY cc.name
```

**Service:** `queries.ts → fetchCausalChains(projectUniqueId)`
**Store:** Stored as part of project detail in selection-store
**UI:** RSB entity card "Causal Chains" section, RSB project card

### Q7: Bridge Entities (startup, alongside Q1)

```cypher
MATCH (e:Entity)
WHERE e.projectCount > 1
RETURN e.name, e.category, e.projectCount, e.pageRank, e.betweenness,
  CASE
    WHEN e.projectCount >= 3 THEN 'gold'
    WHEN e.projectCount = 2 THEN 'silver'
    ELSE 'bronze'
  END AS tier
ORDER BY e.projectCount DESC, e.pageRank DESC
```

**Service:** `queries.ts → fetchBridgeEntities()`
**Store:** Used to enrich allNodes with __bridgeTier during transform
**UI:** LSB bridge filter counts, Canvas bridge glow/rings

### Q8: Collection Stats (on collection header click)

```cypher
MATCH (c:Collection {name: $collectionName})
OPTIONAL MATCH (p:Project)-[:BELONGS_TO]->(c)
OPTIONAL MATCH (e:Entity)-[:MENTIONED_IN]->(p)
RETURN c.name,
  count(DISTINCT p) AS projectCount,
  count(DISTINCT e) AS entityCount
```

Plus: count RELATES_TO, count CausalChains, top entities by pageRank.

**Service:** `queries.ts → fetchCollectionStats(collectionName)`
**Store:** Selection-store (collection detail)
**UI:** RSB Collection Card

---

## 16. Color System

### 14 Entity Category Colors

```
Person:       #4ADE80  (green)
Organization: #60A5FA  (blue)
Place:        #9CA3AF  (grey)
Event:        #F87171  (red)
Concept:      #A78BFA  (purple)
System:       #FB923C  (orange)
Process:      #2DD4BF  (teal)
Technology:   #38BDF8  (sky)
Law:          #FBBF24  (amber)
Agreement:    #E879F9  (fuchsia)
Metric:       #F59E0B  (yellow)
Document:     #94A3B8  (slate)
Resource:     #34D399  (emerald)
Other:        #6B7280  (neutral)
```

### 15 Causal Classification Edge Colors

```
CAUSES:          #EF4444  (red)
ENABLES:         #22C55E  (green)
BLOCKS:          #F97316  (orange)
INFLUENCES:      #8B5CF6  (violet)
DEPENDS_ON:      #3B82F6  (blue)
CONTRADICTS:     #DC2626  (dark red)
SUPPORTS:        #16A34A  (dark green)
PRECEDES:        #A3A3A3  (grey)
COMPETES_WITH:   #F59E0B  (amber)
COOPERATES_WITH: #06B6D4  (cyan)
REGULATES:       #D946EF  (fuchsia)
TRANSFORMS:      #EC4899  (pink)
PRODUCES:        #84CC16  (lime)
CONSUMES:        #78716C  (stone)
IMPLEMENTS:      #0EA5E9  (light blue)
```

### Bridge Tier Colors

```
Gold:   #FFD700  (glow + ring)
Silver: #C0C0C0  (glow + ring)
Bronze: #CD7F32  (subtle glow + ring)
```

### UI Theme Colors

```
Background:       #0a0a0f  (near-black)
Surface:          #141420  (panels, cards)
Surface hover:    #1a1a2e  (hover states)
Border:           #2a2a3e  (subtle borders)
Text primary:     #e4e4e7  (zinc-200)
Text secondary:   #a1a1aa  (zinc-400)
Text muted:       #71717a  (zinc-500)
Accent:           #60A5FA  (blue — selection, focus)
Warning:          #FBBF24  (amber — search highlight)
Error:            #EF4444  (red)
```

---

## 17. Performance Contract

### Targets

| Metric | Target | How |
|--------|--------|-----|
| Initial render | < 3 seconds | warmupTicks=50, load all data in parallel |
| Filter response | < 100ms | Client-side filter, no Neo4j round-trip |
| Node click → RSB | < 500ms | Cache entity details, fetch on first click only |
| Search → results | < 300ms | Neo4j fulltext index + 300ms debounce |
| Path finding | < 1 second | Neo4j shortestPath, max depth 6 |
| Zoom/pan | 60 FPS | LOD rendering, autoPauseRedraw |

### Node Count Budget

| Node Count | Strategy |
|-----------|----------|
| < 500 | Full rendering, all features, no concerns |
| 500–2000 | Reduce bridge glow effects (concentric circles instead of shadowBlur) |
| 2000–5000 | Disable linkDirectionalArrows, simplify LOD, larger zoom thresholds for labels |
| 5000–10000 | Disable pointer interaction except on clicked areas, aggressive LOD |
| > 10000 | Bandwidth slider MUST be used to reduce visible nodes below 10k. Warning shown. |

### Current Data

287 entities + 7 projects = **294 nodes**. This is well within the "full features" tier (<500). All features can be enabled.

### Memory Optimization

- NEVER load `entity.embedding[384]` (384 floats = 1.5KB per entity = 430KB for 287 entities, wasted memory)
- Cache entity details in `selection-store.entityDetails` Map (avoid refetching)
- Memoize `filteredNodes` and `filteredLinks` (recompute only when filters change)
- Use `useMemo` for `graphData` object passed to react-force-graph-2d
- Use `useCallback` for all canvas painting functions

---

## 18. File Structure

```
components/02-graph-studio/
├── DESIGN-SPEC.md                     ← THIS FILE (read-only reference)
├── COMPONENT_01_HANDOFF.md            ← READ-ONLY (from Component 01)
├── STATUS.md                          ← OPEN → CLOSED when done
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── .env                               ← NEO4J connection (gitignored)
├── src/
│   ├── main.tsx                       ← ReactDOM.createRoot
│   ├── App.tsx                        ← Layout: StatusBar + LSB + Canvas + RSB
│   │
│   ├── types/
│   │   └── graph.ts                   ← GraphNode, GraphLink, EntityDetail, etc.
│   │
│   ├── services/
│   │   ├── neo4j.ts                   ← Driver singleton (bolt, memorytonic db)
│   │   ├── queries.ts                 ← All Cypher queries as named async functions
│   │   └── transforms.ts             ← Neo4j records → typed data + computed fields
│   │
│   ├── stores/
│   │   ├── graph-store.ts             ← Data + filters + filtered computation
│   │   ├── selection-store.ts         ← Selection + lock + exploration stack + entity cache
│   │   └── ui-store.ts               ← Sidebar state, search, path mode, zoom
│   │
│   ├── hooks/
│   │   ├── useGraphData.ts            ← Memoized graphData for react-force-graph-2d
│   │   ├── useNodePainter.ts          ← nodeCanvasObject callback (full rendering pipeline)
│   │   └── useEntityDetail.ts         ← Fetch + cache entity detail on demand
│   │
│   ├── components/
│   │   ├── GraphCanvas.tsx            ← react-force-graph-2d wrapper
│   │   ├── StatusBar.tsx              ← Top bar: collection name + counts
│   │   ├── Legend.tsx                 ← Floating interactive legend
│   │   │
│   │   ├── left-sidebar/
│   │   │   ├── LeftSidebar.tsx        ← Container with collapsible sections
│   │   │   ├── CollectionHeader.tsx   ← Section 1: name + counts
│   │   │   ├── SearchBar.tsx          ← Section 2: search input + results
│   │   │   ├── ImportanceSlider.tsx   ← Section 3: bandwidth two-handle slider
│   │   │   ├── ProjectFilter.tsx      ← Section 4: project checkboxes
│   │   │   ├── CategoryFilter.tsx     ← Section 5: category toggles + color dots
│   │   │   ├── BridgeFilter.tsx       ← Section 6: bridge tier toggles
│   │   │   ├── EdgeTypeFilter.tsx     ← Section 7: causal classification toggles
│   │   │   ├── PathFinder.tsx         ← Section 8: path finding inputs + results
│   │   │   ├── SavedViews.tsx         ← Section 9: named view bookmarks (IF EASY)
│   │   │   └── ExportButton.tsx       ← Section 10: export trigger
│   │   │
│   │   ├── right-sidebar/
│   │   │   ├── RightSidebar.tsx       ← Container: scrollable card stack
│   │   │   ├── PrimaryCard.tsx        ← Full entity card (locked or unlocked)
│   │   │   ├── ExplorationCard.tsx    ← Scoped card (Level 1 + Level 2)
│   │   │   ├── ProjectCard.tsx        ← Project info card
│   │   │   ├── CollectionCard.tsx     ← Collection stats card
│   │   │   ├── MetricBar.tsx          ← Reusable: horizontal bar (Influence, Bridge Score)
│   │   │   ├── ConnectionList.tsx     ← Reusable: clickable entity list
│   │   │   ├── CausalChainView.tsx    ← Reusable: ordered chain visualization
│   │   │   └── HopControl.tsx         ← [-] N [+] hop radius control
│   │   │
│   │   └── shared/
│   │       ├── CategoryBadge.tsx      ← Color dot + category name
│   │       ├── BridgeBadge.tsx        ← Gold/Silver/Bronze badge
│   │       ├── CollapsibleSection.tsx ← Generic collapsible wrapper
│   │       └── Tooltip.tsx            ← Hover tooltip (canvas overlay)
│   │
│   ├── constants/
│   │   ├── colors.ts                  ← CATEGORY_COLORS, CAUSAL_COLORS, BRIDGE_COLORS, THEME
│   │   ├── config.ts                  ← Force params, size levels, LOD thresholds, hop defaults
│   │   └── queries.ts                ← Cypher query strings (if separate from service)
│   │
│   └── styles/
│       └── globals.css                ← Tailwind base + dark theme CSS vars + scrollbar styling
│
└── tests/
    ├── transforms.test.ts             ← Data transform unit tests
    ├── filters.test.ts                ← Filter pipeline unit tests
    └── stores.test.ts                 ← Store action unit tests
```

---

## 19. Build Phases

### Phase 1: Scaffold + Neo4j Connection (30 min)
- Vite + React + TypeScript
- Install: react-force-graph-2d, neo4j-driver, zustand, tailwindcss
- .env with Neo4j credentials
- Dark theme globals.css
- neo4j.ts driver singleton
- **Test:** Query returns 287 entities in browser console

### Phase 2: Data Layer + Basic Graph (1 session)
- types/graph.ts — all type definitions
- queries.ts — Q1 (collection graph), Q2 (projects), Q7 (bridges)
- transforms.ts — full transform pipeline (dedup, compositeImportance, sizeLevel, bridgeTier, parallel edges)
- graph-store.ts — loadCollection, allNodes, allLinks
- GraphCanvas.tsx — react-force-graph-2d with default rendering
- Basic category colors on nodes, basic edge colors
- Force tuning
- **Test:** 287 colored nodes + 217 colored edges render

### Phase 3: Custom Node Painting + LOD (1 session)
- useNodePainter.ts — full canvas painting pipeline (glow, rings, fill, labels, dimming)
- Node size clamping (6 levels)
- LOD by zoom level
- Bridge glow and rings
- Forced labels (projects, gold/silver bridges, top 5%)
- nodePointerAreaPaint for hit detection
- Edge styling (width by magnitude, dashes by evidenceStrength, arrows)
- **Test:** Bridge entities glow. Zoom out → dots. Zoom in → labels appear.

### Phase 4: Left Sidebar + Filters (1 session)
- App.tsx three-column layout
- LeftSidebar.tsx with all collapsible sections
- All filter components (Sections 3-7)
- Filter pipeline in graph-store (recomputeFiltered)
- Legend.tsx (floating, interactive)
- Right-click → LSB scroll/uncollapse
- **Test:** Toggle category → nodes hide. Drag bandwidth slider → density changes.

### Phase 5: Right Sidebar + Multi-Card System (1 session)
- RightSidebar.tsx container
- PrimaryCard.tsx with full anatomy
- ExplorationCard.tsx with Level 1/Level 2
- Lock/unlock mechanism
- Hop control [-] N [+]
- queries.ts → Q3 (entity detail)
- selection-store.ts — full implementation
- Entity detail caching
- Scoped card computation (shared connections, own connections, scoped role)
- **Test:** Click entity → card opens. Lock → click another → exploration card added. Unlock → stack clears.

### Phase 6: Search + Path Finder (1 session)
- SearchBar.tsx — debounced fulltext search
- queries.ts → Q4 (fulltext search), Q5 (shortest path)
- Search results in LSB + highlight overlay on canvas
- Click result → zoom to node + select
- PathFinder.tsx — multi-entity path inputs + results
- Path overlay on canvas
- **Test:** Search "IMF" → node highlighted. Find path IMF→OPEC → path lights up.

### Phase 7: Polish + Export + Close (1 session)
- ExportButton.tsx + export flow
- StatusBar.tsx
- Project card + Collection card
- Causal chain visualization in entity cards
- Edge hover tooltips
- Saved views (IF EASY — localStorage)
- Minimap (IF EASY — project nodes only)
- Edge cases: empty collection, no bridges, single entity
- Performance testing with full dataset
- Write STATUS.md → CLOSED
- Write interface contract for Component 03
- **Test:** Full walkthrough of every feature

---

## 20. Decisions Log (Component 02)

| # | Decision | Rationale |
|---|----------|-----------|
| D21 | 6 discrete node size levels, not continuous | Prevents nodes becoming too big or too small. Visual consistency. |
| D22 | Multi-card collapsible RSB with scoped exploration | Research requires holding context while exploring. Scoped cards show relationships to the locked anchor. |
| D23 | Lock + exploration interaction model | Unity Inspector pattern. Lock anchor, click around, build understanding. |
| D24 | Hop radius 1-3, default 2 | 1 = tight focus, 2 = balanced default, 3 = wide net. More than 3 creates too much noise. |
| D25 | Fulltext search only (no vector/semantic) | Vector search needs Python BERT for query embeddings. Deferred to Component 04 MCP. |
| D26 | No temporal filtering | Complex to implement, skip for v4 launch. |
| D27 | No multi-select / bulk operations | Project-level filtering is sufficient for current data size. |
| D28 | No keyboard shortcuts | Not needed for current interaction model. |
| D29 | No three-mode workspace | Only Explore mode. Table/Present deferred. |
| D30 | Right-click → LSB uncollapse (no floating context menu) | Single control panel. Users learn one interaction pattern. |
| D31 | Legend as interactive control | Clicking legend color swatch toggles category. Mirrors LSB filter. Two access points for same control. |
| D32 | Minimap shows project nodes only (IF EASY) | Projects are structural anchors. 7 dots is clean. Full entity minimap would be cluttered. |
| D33 | Saved views via localStorage (IF EASY) | No backend needed. Views are filter+zoom state. 3 starter presets. |
| D34 | Export only (no import in Graph Studio) | Import happens via CLI or future Component 03/05. |
| D35 | GDS metrics shown as human language | PageRank→Influence, Betweenness→Bridge Score, Degree→Connections, projectCount→Cross-Document. Users never see raw algorithm names. |
| D36 | Composite importance: 0.35 PR + 0.25 BW + 0.20 Deg + 0.20 PC | Balanced weighting. Influence has most weight. Bridge and connections roughly equal. |
| D37 | Edge labels visible at globalScale > 3.0 | Low zoom = too many labels. High zoom = focused area, labels add value. |
| D38 | Project nodes exempt from bandwidth filter | Projects are structural, always visible regardless of importance slider. |
| D39 | Exploration card scoped to locked entity's perspective | Level 1: relationship + role + definition. Level 2: shared connections, own connections, full metrics. |
| D40 | Exploration card collapsed header shows relationship type | Scan the stack without expanding: "OPEC (via IMF) — REGULATES" tells the story. |

---

## 21. Definition of Done

Component 02 is CLOSED when ALL of these pass:

### Core Rendering
- [ ] Collection graph renders with 287 nodes, 217 edges
- [ ] Nodes colored by category (14 colors)
- [ ] Nodes sized by composite importance (6 discrete levels)
- [ ] Edges colored by causalClassification (15 colors)
- [ ] Edges styled by magnitude (width) and evidenceStrength (dash)
- [ ] Bridge entities have glow + ring (Gold/Silver/Bronze)
- [ ] LOD rendering works across zoom levels
- [ ] Labels forced for projects, gold/silver bridges, top 5%
- [ ] Labels appear for all nodes at zoom > 1.5

### Interaction
- [ ] Click entity → RSB opens with full card
- [ ] Click project → RSB opens with project card
- [ ] Hop highlighting works (1-3 hops, dimming outside)
- [ ] Lock entity → click others → exploration cards stack
- [ ] Exploration cards show scoped data (relationship, shared connections)
- [ ] Collapse/expand exploration cards
- [ ] Unlock → stack clears
- [ ] Click connection in card → navigates to that entity
- [ ] Background click → RSB closes, selection clears
- [ ] Hover node → tooltip (name + category)
- [ ] Hover edge → tooltip (relType + description)
- [ ] Right-click → LSB scrolls to relevant section
- [ ] Drag node → pins at drop position
- [ ] Zoom/pan works smoothly

### Left Sidebar
- [ ] Collection header shows name + counts
- [ ] Search finds entities by name/definition/alias
- [ ] Search results → click → zoom to node + select
- [ ] Search highlight overlay on canvas
- [ ] Bandwidth slider filters by composite importance
- [ ] Project filter toggles work
- [ ] Category filter toggles work (synced with Legend)
- [ ] Bridge tier filter toggles work
- [ ] Edge type filter toggles work
- [ ] All filters are AND-chained
- [ ] Filter counts update correctly

### Path Finder
- [ ] Two-entity path works
- [ ] Multi-entity path works (3+ entities, pairwise)
- [ ] Path highlighted on canvas
- [ ] Path results displayed in LSB

### Info Cards
- [ ] Entity card: name, category, aliases, definition, metrics (human language)
- [ ] Entity card: per-project roles (from MENTIONED_IN)
- [ ] Entity card: connections list (clickable)
- [ ] Entity card: causal chains
- [ ] Entity card: similar entities
- [ ] Exploration card Level 1: relationship + role + definition
- [ ] Exploration card Level 2: shared/own connections, metrics, projects
- [ ] Project card: summary, tags, narrative, entity count, HTML link
- [ ] Collection card: stats, bridges, top entities

### Visual
- [ ] Dark industrial theme consistent
- [ ] Near-black background (#0a0a0f)
- [ ] Legend interactive (click toggles category)
- [ ] No raw GDS property names visible to user

### Data Integrity
- [ ] All data from Neo4j (no hardcoded test data)
- [ ] Entity roles are per-project (from MENTIONED_IN relationship)
- [ ] Database name is 'memorytonic' (not 'neo4j')
- [ ] Embeddings NOT loaded (384d vectors excluded from queries)

### Polish
- [ ] Export button works (triggers export_collection.py)
- [ ] Status bar shows correct counts
- [ ] Edge cases handled (empty search, no path found, single entity)
- [ ] Minimap with project nodes (IF EASY — skip if complex)
- [ ] Saved views with 3 starters (IF EASY — skip if complex)

### Documentation
- [ ] STATUS.md → CLOSED
- [ ] Interface contract for Component 03 written
- [ ] Any new decisions logged in memory/decisions.md

---

## 22. Traps

Inherited from Component 01 + new Graph Studio traps:

| # | Trap | Consequence | Prevention |
|---|------|------------|------------|
| T1 | Database name is `memorytonic`, not `neo4j` | Silent wrong-database errors, empty results | Always specify `{ database: 'memorytonic' }` in driver session |
| T2 | d3-force MUTATES link.source/target | Links change from IDs to node objects after first tick | Always create NEW arrays when updating graphData. Never mutate. |
| T3 | Entity role is per-project | Role stored on MENTIONED_IN relationship, not Entity node | Fetch role from relationship, not node property |
| T4 | SIMILAR_TO is bidirectional | Both directions stored in Neo4j | Use `(e)-[s:SIMILAR_TO]-(other)` pattern (undirected) to avoid duplicates |
| T5 | Parallel edges between same entity pair | Multiple RELATES_TO with different relTypes | Detect during transform, assign curvature offsets |
| T6 | Neo4j Integer types | Neo4j returns Integer objects, not JS numbers | Use `.toNumber()` or `neo4j.integer.toNumber()` in transforms |
| T7 | htmlPath is relative | Points to `data/sources/YYYY-MM-DD/slug/01_html.html` relative to `components/01-ingestion/` | Construct full path: `components/01-ingestion/${htmlPath}` |
| T8 | Embedding arrays in entity nodes | 384 floats per entity = wasted bandwidth | EXCLUDE embedding from all Cypher RETURN clauses |
| T9 | Windows cp1252 terminal | Unicode chars break console output | Use ASCII equivalents in any console.log |
| T10 | Canvas coordinates vs screen coordinates | Click positions need translation | Use `graph2ScreenCoords` / `screen2GraphCoords` for overlays |
| T11 | graphData referential equality | react-force-graph-2d checks reference, not deep equality | Create new `{ nodes: [...], links: [...] }` object on every filter change |
| T12 | Bridge tier 'bronze' definition | Bronze = projectCount 1 BUT high betweenness (> 75th percentile) | Don't assign bronze to every single-project entity |

---

## 23. Handoff Document Discrepancies

COMPONENT_01_HANDOFF.md is **READ-ONLY** (from Component 01). The following discrepancies exist between the handoff and this DESIGN-SPEC. **This DESIGN-SPEC takes precedence** for Component 02 implementation. These are documented for awareness.

| # | Discrepancy | Handoff Says | DESIGN-SPEC Says | Resolution |
|---|------------|-------------|------------------|-----------|
| H1 | Entity.role property | Lists `role` as Entity node property | `role` is on MENTIONED_IN relationship, not Entity node | **DESIGN-SPEC is correct.** Handoff listing is misleading but the Query 2 example correctly uses `m.role`. |
| H2 | Query 2 missing fields | Returns `{entity: other.name, relType: r.relType, description: r.description}` | Needs `causalClassification`, `magnitude`, `year` too | **DESIGN-SPEC Q3 is authoritative.** Use DESIGN-SPEC queries, not handoff queries. |
| H3 | Query 2 missing uniqueId | Returns `{project: p.name, role: m.role}` | Needs `uniqueId: p.uniqueId` for project identification | **DESIGN-SPEC Q3 is authoritative.** |
| H4 | Query 2 missing CausalChain name | Fetches CHAIN_LINK but not CausalChain node | Needs `cc.name` for chain titles in cards | **DESIGN-SPEC Q3 is authoritative.** |
| H5 | Semantic search listed | Query 7 lists vector search | Deferred to Component 04 (D25) | **Fulltext only.** Vector search needs Python BERT. |
| H6 | Collection Stats query absent | No collection stats query | Q8 fetches counts, bridges, top entities | **DESIGN-SPEC adds Q8.** |
| H7 | Projects query not explicit | No standalone projects query | Q2 loads project stubs for LSB filter | **DESIGN-SPEC adds Q2.** |

**Rule:** When building, ALWAYS use DESIGN-SPEC queries (Q1-Q8). Handoff queries are reference starting points, not copy-paste-ready.

---

## 24. Integration Verification Checklist

Before each build phase, verify these integration points:

### Data Layer Checks
- [ ] Neo4j driver connects with database: 'memorytonic' (not 'neo4j')
- [ ] Q1 returns all 287 entities + 217 RELATES_TO edges (no embeddings)
- [ ] Q2 returns all 7 projects with uniqueId
- [ ] Q3 returns entity with per-project roles from MENTIONED_IN (not Entity.role)
- [ ] All Neo4j Integer values converted to JS numbers
- [ ] SIMILAR_TO deduplicated (undirected match)
- [ ] Parallel edges detected and curvature assigned

### Store → Component Wiring Checks
- [ ] graph-store.filteredNodes drives GraphCanvas nodes
- [ ] graph-store.filteredLinks drives GraphCanvas links
- [ ] graph-store.categoryFilter drives BOTH CategoryFilter component AND Legend component
- [ ] selection-store.lockedNode drives RSB primary card display
- [ ] selection-store.explorationStack drives RSB exploration card stack
- [ ] selection-store.hopRadius drives canvas hop highlighting
- [ ] ui-store.searchResults drives LSB search results AND canvas search overlay
- [ ] graph-store.highlightedPath drives canvas path overlay AND LSB path results

### Filter Pipeline Checks
- [ ] Project filter: hiding a project hides its exclusive entities, bridges stay
- [ ] Bandwidth slider: project nodes exempt (always visible)
- [ ] Category filter: synced with Legend clicks (same Set<string>)
- [ ] Bridge filter: all 4 tiers toggleable (gold, silver, bronze, none)
- [ ] Edge type filter: hiding edges keeps nodes visible (just disconnected)
- [ ] All filters AND-chained (entity must pass ALL to be visible)
- [ ] Overlay layer (search/path/selection) overrides dimming, not filtering

### RSB Multi-Card Checks
- [ ] Click entity (unlocked) → single full card opens
- [ ] Lock → click another → exploration card ADDS (doesn't replace)
- [ ] Exploration card Level 1: relationship + role + definition visible
- [ ] Exploration card Level 2: shared/own connections behind "More details"
- [ ] Collapsed header shows: "Name (via Locked) — RELATIONSHIP_TYPE"
- [ ] Click connection in exploration card → navigates (new primary, stack clears)
- [ ] Unlock → all exploration cards removed
- [ ] Entity details cached (no refetch on second click)

### Canvas Rendering Checks
- [ ] 6 discrete node sizes (4/6/8/12/16/20px radius) — no in-between
- [ ] Bridge glow only on gold/silver/bronze entities
- [ ] Labels always visible for: projects, gold/silver bridges, top 5%, selected, hovered
- [ ] LOD changes at zoom thresholds (0.3, 0.8, 1.5, 3.0)
- [ ] Edge width by magnitude (foundational=2.5, significant=1.5, marginal=0.8)
- [ ] Edge dash by evidenceStrength (established=solid, claimed=[5,3], disputed=[3,3], speculative=[2,4])
- [ ] Hop highlighting dims everything outside N-hop radius to 15% opacity
- [ ] Locked mode: locked entity's hops stay, clicked entities get selection rings

### End-to-End Flow Checks
- [ ] Load collection → graph renders → click entity → card opens → lock → explore → unlock
- [ ] Search → results list → click result → zoom to node → card opens
- [ ] Path finder → enter 2 entities → path highlights → clear path
- [ ] Filter → toggle category → nodes hide → toggle back → nodes return
- [ ] Right-click → LSB scrolls to relevant section

---

*End of Design Specification. This document is the single source of truth for Component 02 implementation.*
*QA integration review completed 2026-04-06.*
