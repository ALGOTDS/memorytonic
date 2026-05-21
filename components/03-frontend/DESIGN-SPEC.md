# Component 03: Frontend — Complete Design Specification

**Status:** LOCKED (Design Complete, Build Not Started)
**Author:** Design session 2026-04-07
**Depends on:** Component 01: Ingestion (CLOSED), Component 02: Graph Studio (CLOSED)
**Reads from:** Neo4j (bolt://localhost:7687, database: memorytonic)
**Embeds:** Component 02 Graph Studio (direct import of App.tsx)

---

## Table of Contents

1. [What the Frontend Is](#1-what-the-frontend-is)
2. [Navigation Architecture](#2-navigation-architecture)
3. [Data Flow — Neo4j to UI](#3-data-flow--neo4j-to-ui)
4. [Top Navigation Bar](#4-top-navigation-bar)
5. [Home Screen — Directory Grid](#5-home-screen--directory-grid)
6. [Directory View — Tabbed Data Console](#6-directory-view--tabbed-data-console)
7. [Collection View — Full Collection Console](#7-collection-view--full-collection-console)
8. [Project View — Info Card Stack](#8-project-view--info-card-stack)
9. [Entity View — Cross-Document Profile](#9-entity-view--cross-document-profile)
10. [Source Viewer — Document Reader](#10-source-viewer--document-reader)
11. [Graph Studio Integration](#11-graph-studio-integration)
12. [Settings Page](#12-settings-page)
13. [Cross-Navigation Contract](#13-cross-navigation-contract)
14. [Pill & Tag Display Pattern](#14-pill--tag-display-pattern)
15. [Neo4j Queries — Complete Mapping](#15-neo4j-queries--complete-mapping)
16. [Zustand Stores — State Architecture](#16-zustand-stores--state-architecture)
17. [Type Definitions](#17-type-definitions)
18. [Component Library](#18-component-library)
19. [Color System & Design Tokens](#19-color-system--design-tokens)
20. [File Structure](#20-file-structure)
21. [Build Phases](#21-build-phases)
22. [Decisions Log (Component 03)](#22-decisions-log-component-03)
23. [Definition of Done](#23-definition-of-done)
24. [Traps](#24-traps)
25. [Integration Verification Checklist](#25-integration-verification-checklist)

---

## 1. What the Frontend Is

The app shell, navigation, and data management layer for MemoryTonic. It wraps Component 02 (Graph Studio) and adds browsing, searching, and managing of directories, collections, projects, and entities. It is the primary interface users interact with — Graph Studio is one view within it.

**One sentence:** Browse your knowledge graph through directories, collections, projects, and entities — then open Graph Studio to visualize any collection.

**What it is:**
- App shell with persistent top navigation
- Home screen showing directory cards
- Directory drill-down with tabbed data tables (Collections, Projects, Entities)
- Collection console with project management, bridge entities, recommendations
- Project view with rich info cards
- Entity view with cross-document profile
- Source document viewer
- Settings page for Neo4j connection
- Full cross-navigation: every entity name, project name, collection name is a clickable link

**What it is NOT:**
- Not an editor for graph data (entities, relationships stay read-only from ingestion)
- Not an importer (document ingestion is Component 01's pipeline, triggered externally)
- Not the Electron shell (Component 05 handles desktop packaging, auth, updates)
- Not the MCP surface (Component 04 handles Claude integration)

**What it CAN modify:**
- Directory descriptions (manual text, stored as DirectoryCategory.description in Neo4j)
- Collection descriptions (manual text, stored as Collection.description in Neo4j — new property)
- Collection membership (add/remove projects from collections via Neo4j writes)
- Create new directories (create DirectoryCategory nodes)
- Delete empty directories (remove DirectoryCategory nodes with zero IN_DIRECTORY)
- Create new collections (create Collection nodes)

**Data scope:** Global. Unlike Graph Studio which is collection-scoped, the Frontend shows ALL directories, ALL collections, ALL projects, ALL entities across the entire database.

---

## 2. Navigation Architecture

### Route Map

```
/                           → Home Screen (Directory Grid)
/directory/:name            → Directory View (tabbed: Collections | Projects | Entities)
/collection/:name           → Collection View (full console)
/project/:uniqueId          → Project View (info card stack)
/entity/:name               → Entity View (cross-document profile)
/graph/:collectionName      → Graph Studio (embedded Component 02)
/source?path=<encoded>      → Source Viewer (HTML document reader)
/settings                   → Settings Page
```

### Routing Strategy

Client-side routing via a lightweight router. No external dependency — a simple hash-based or history-based router (~50 lines). No React Router needed for 8 routes.

```typescript
type Route =
  | { page: 'home' }
  | { page: 'directory'; name: string }
  | { page: 'collection'; name: string }
  | { page: 'project'; uniqueId: string }
  | { page: 'entity'; name: string }
  | { page: 'graph'; collectionName: string }
  | { page: 'source'; htmlPath: string }   // encoded via encodeURIComponent() in query param
  | { page: 'settings' }
```

**Source route encoding:** `htmlPath` contains slashes (e.g. `data/sources/2026-04-06/project/01_html.html`). It CANNOT be a path segment. The router encodes it as a query parameter: `#/source?path=data%2Fsources%2F2026-04-06%2Fproject%2F01_html.html`. The `navigate()` action calls `encodeURIComponent(htmlPath)` when building the URL and `decodeURIComponent()` when parsing.

### Navigation Flow (User Journeys)

```
Journey 1: Browse → Graph
  Home → click directory card → Directory View → Collections tab → click collection
  → Collection View → "Open Graph Studio" button → Graph Studio

Journey 2: Browse → Entity
  Home → click directory → Directory View → Entities tab → click entity name
  → Entity View → click "Mentioned in: Petrodollar System" → Project View
  → click "View Source Document" → Source Viewer

Journey 3: Cross-navigation
  Entity View (IMF) → click relationship "Federal Reserve" → Entity View (Federal Reserve)
  → click "Global Finance Systems" collection → Collection View → click project
  → Project View → click entity name → Entity View (another entity)

Journey 4: Collection management
  Collection View → "Add Project" button → modal shows GDS recommendations
  → select project → project added → bridge entities recalculate
```

### Breadcrumb Trail

Every page shows a breadcrumb in the top nav:

```
Home > Research > Global Finance Systems > Petrodollar System
Home > Research > Global Finance Systems > IMF
Home > Entity: IMF (global — not directory-scoped)
```

Breadcrumbs are clickable. Each segment navigates to its page.

**Rules:**
- Home is always first
- Directory name appears when navigating from a directory
- Collection name appears when navigating from a collection
- Entity views are global (not scoped to a directory), so breadcrumb shows `Entity: Name`
- Graph Studio shows: `Home > Collection: [name] > Graph Studio`

---

## 3. Data Flow — Neo4j to UI

```
NEO4J DATABASE (memorytonic)
       │
       │  bolt://localhost:7687
       │  neo4j-driver (SHARED with Component 02)
       │
       ▼
┌─────────────────────────────┐
│   services/neo4j.ts         │  ← IMPORTED from Component 02 (same driver singleton)
│   services/frontend-queries │  ← NEW: Frontend-specific query functions
└──────────┬──────────────────┘
           │
           │  Returns typed data
           │
           ▼
┌─────────────────────────────┐
│   ZUSTAND STORES (5 new)    │
│                             │
│   navigation-store.ts       │  ← Current route, breadcrumbs, history
│   directory-store.ts        │  ← Directories + stats, CRUD operations
│   collection-store.ts       │  ← Collection detail, membership ops
│   project-store.ts          │  ← Project detail, entities, chains
│   entity-store.ts           │  ← Entity cross-document profile
│                             │
│   IMPORTED (3 from C02):    │
│   graph-store.ts            │  ← Read-only: collection name, loading state
│   selection-store.ts        │  ← Read-only: selectedNode for breadcrumb
│   ui-store.ts               │  ← Read-only: search state
└──────────┬──────────────────┘
           │
           │  React subscriptions (useStore selectors)
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│   PAGES                                                  │
│                                                          │
│   HomePage.tsx ← directory-store.directories              │
│   DirectoryPage.tsx ← directory-store.directoryDetail     │
│   CollectionPage.tsx ← collection-store.collectionDetail  │
│   ProjectPage.tsx ← project-store.projectDetail           │
│   EntityPage.tsx ← entity-store.entityProfile             │
│   GraphPage.tsx ← Component 02 App.tsx (direct embed)     │
│   SourcePage.tsx ← htmlPath from route                    │
│   SettingsPage.tsx ← local state                          │
└─────────────────────────────────────────────────────────┘
```

### Data Load Sequences

**Home Screen load:**
```
1. App mounts, route = /
2. directory-store.loadDirectories() fires
3. frontend-queries → fetchAllDirectories()
   │  Returns: [{name, description, projectCount, collectionCount, entityCount}]
4. directory-store.directories = result
5. HomePage renders directory cards
```

**Directory View load:**
```
1. Route changes to /directory/Research
2. directory-store.loadDirectoryDetail("Research") fires
3. frontend-queries → fetchDirectoryCollections("Research")
   │  Returns: collections with project counts, entity counts, top tags, top entities
4. frontend-queries → fetchDirectoryProjects("Research")
   │  Returns: projects with entity counts, dates, tags, html links
5. frontend-queries → fetchDirectoryEntities("Research")
   │  Returns: entities with categories, project counts, collection names
6. DirectoryPage renders 3-tab view
```

**Collection View load:**
```
1. Route changes to /collection/Global Finance Systems
2. collection-store.loadCollection("Global Finance Systems") fires
3. frontend-queries → fetchCollectionFull("Global Finance Systems")
   │  Returns: description, stats, projects, bridge entities, top entities,
   │  causal chains, category breakdown
4. CollectionPage renders full console
```

---

## 4. Top Navigation Bar

Persistent across all pages. 48px height. Full width.

```
┌──────────────────────────────────────────────────────────────────┐
│  ◆ MemoryTonic    Home > Research > Global Finance Systems       │
│                                                        ⚙ Settings│
└──────────────────────────────────────────────────────────────────┘
```

### Layout

| Element | Position | Behavior |
|---------|----------|----------|
| **Logo + Name** | Left, fixed | `◆ MemoryTonic` — click navigates to Home |
| **Breadcrumb** | Center-left, flex | Clickable path segments. Truncates with `...` if too long. |
| **Settings icon** | Right, fixed | ⚙ gear icon — navigates to /settings |

### Styling

```css
.top-nav {
  height: 48px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
}

.breadcrumb-segment {
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s ease;
}
.breadcrumb-segment:hover {
  color: var(--text-primary);
}
.breadcrumb-segment:last-child {
  color: var(--text-primary);
  cursor: default;
}
.breadcrumb-separator {
  color: var(--text-muted);
  margin: 0 6px;
}
```

---

## 5. Home Screen — Directory Grid

The landing page. Shows all directories as cards in a responsive grid.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Top Nav                                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─── Graph Studio ──────────────────────────────────────────┐   │
│  │  🔬 Open Graph Studio          [Select Collection ▼]      │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  Your Directories                              [+ New Directory]  │
│                                                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐   │
│  │  📁 Research      │  │  📁 Business      │  │  📁 Personal  │   │
│  │                   │  │                   │  │               │   │
│  │  Systems analysis │  │  Market research  │  │  Personal     │   │
│  │  and geopolitical │  │  and competitive  │  │  knowledge    │   │
│  │  investigations   │  │  intelligence     │  │  management   │   │
│  │                   │  │                   │  │               │   │
│  │  5 collections    │  │  2 collections    │  │  1 collection │   │
│  │  12 projects      │  │  4 projects       │  │  2 projects   │   │
│  │  287 entities     │  │  89 entities      │  │  34 entities  │   │
│  │                   │  │                   │  │               │   │
│  │  ✏️ Edit  🗑️ Delete│  │  ✏️ Edit  🗑️ Delete│  │  ✏️ Edit      │   │
│  └──────────────────┘  └──────────────────┘  └──────────────┘   │
│                                                                    │
│  ┌──────────────────┐                                             │
│  │  📁 Skills        │                                             │
│  │                   │                                             │
│  │  Technical skills │                                             │
│  │  and frameworks   │                                             │
│  │                   │                                             │
│  │  1 collection     │                                             │
│  │  3 projects       │                                             │
│  │  56 entities      │                                             │
│  │                   │                                             │
│  │  ✏️ Edit  🗑️ Delete│                                             │
│  └──────────────────┘                                             │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Graph Studio Quick-Launch Bar

At the top of the home screen, a prominent bar lets users jump directly to Graph Studio:

```
┌─── Graph Studio ──────────────────────────────────────────────┐
│  🔬 Open Graph Studio          [Select Collection ▼]          │
└───────────────────────────────────────────────────────────────┘
```

- **Select Collection dropdown:** Lists all collections. On select → navigate to `/graph/:collectionName`
- Background: `var(--surface-raised)` with left accent border (4px `var(--accent)`)
- This is the primary entry point to the graph visualization

### Directory Card Anatomy

```
┌──────────────────────────────────┐
│  📁 Research                      │  ← Directory name (click → /directory/Research)
│                                   │
│  Systems analysis and             │  ← Description (editable, 2-3 lines max, overflow ellipsis)
│  geopolitical investigations      │
│                                   │
│  5 collections                    │  ← Stats row 1
│  12 projects                      │  ← Stats row 2
│  287 entities                     │  ← Stats row 3
│                                   │
│  ✏️ Edit   🗑️ Delete               │  ← Action row (bottom)
└──────────────────────────────────┘
```

### Card Styling

```css
.directory-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.directory-card:hover {
  border-color: var(--accent);
  background: var(--surface-hover);
}
```

### Grid Layout

- CSS Grid: `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
- Gap: 16px
- Responsive: 1 column on narrow, 2-3 on wide, 4+ on very wide

### Directory Card Data → UI Mapping

| UI Element | Neo4j Source | Query |
|-----------|-------------|-------|
| Name | `DirectoryCategory.name` | Q-F1 |
| Description | `DirectoryCategory.description` (may be null) | Q-F1 |
| Collection count | `count(DISTINCT c)` where `(p)-[:BELONGS_TO]->(c)` and `(p)-[:IN_DIRECTORY]->(d)` | Q-F1 |
| Project count | `count(DISTINCT p)` where `(p)-[:IN_DIRECTORY]->(d)` | Q-F1 |
| Entity count | `count(DISTINCT e)` where `(e)-[:MENTIONED_IN]->(p)-[:IN_DIRECTORY]->(d)` | Q-F1 |

### Directory CRUD Operations

**Create Directory:**
- "New Directory" button opens inline form at the end of the grid
- Fields: Name (required, unique), Description (optional textarea)
- On save: `CREATE (:DirectoryCategory {name: $name, description: $desc})`
- Validation: name uniqueness checked before write

**Edit Directory:**
- ✏️ button opens inline edit mode on the card
- Name field becomes editable input, description becomes textarea
- Save/Cancel buttons replace Edit/Delete
- On save: `MATCH (d:DirectoryCategory {name: $oldName}) SET d.name = $newName, d.description = $desc`
- If name changes, update all IN_DIRECTORY relationships? No — projects link to DirectoryCategory by node reference, not by name string. Name change is safe.

**Delete Directory:**
- 🗑️ button shows ConfirmDialog
- **Only allowed if directory has zero projects** (no IN_DIRECTORY edges)
- If directory has projects: button is disabled, tooltip explains "Remove all projects first"
- On confirm: `MATCH (d:DirectoryCategory {name: $name}) DELETE d`
- Default directories (Research, Business, Personal) CAN be deleted if empty

### Graph Studio Quick-Launch

The collection dropdown at the top fetches all collections:
```cypher
MATCH (c:Collection)
OPTIONAL MATCH (p:Project)-[:BELONGS_TO]->(c)
RETURN c.name AS name, count(p) AS projectCount
ORDER BY c.name
```

Selecting a collection navigates to `/graph/:collectionName`.

---

## 6. Directory View — Tabbed Data Console

A full data console for one directory. Three tabs showing different facets of the directory's contents.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Top Nav: Home > Research                                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  📁 Research                                                      │
│  Systems analysis and geopolitical investigations                 │
│  5 collections · 12 projects · 287 entities                       │
│                                                                    │
│  ┌─────────────┬──────────────┬─────────────┐                    │
│  │ Collections │   Projects   │  Entities   │  ← Tab bar         │
│  ├─────────────┴──────────────┴─────────────┤                    │
│  │                                           │                    │
│  │  ┌─ Search ─────────────────────────────┐│                    │
│  │  │ 🔍 Search collections...              ││                    │
│  │  └──────────────────────────────────────┘│                    │
│  │                                           │                    │
│  │  ┌─ Filters ────────────────────────────┐│                    │
│  │  │ By entity: IMF, OPEC +3 more   ✕     ││                    │
│  │  │ By tag: oil, dollar, hegemony  ✕     ││                    │
│  │  └──────────────────────────────────────┘│                    │
│  │                                           │                    │
│  │  ┌─ Table ──────────────────────────────┐│                    │
│  │  │ (content varies by tab)               ││                    │
│  │  └──────────────────────────────────────┘│                    │
│  │                                           │                    │
│  └───────────────────────────────────────────┘                    │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Tab Bar Styling

```css
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  gap: 0;
}
.tab {
  padding: 10px 24px;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.tab:hover {
  color: var(--text-secondary);
}
.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
```

---

### 6.1 Collections Tab

Shows all collections that contain projects in this directory.

#### Table Columns

| Column | Data | Width | Sortable |
|--------|------|-------|----------|
| **Name** | Collection name (clickable → /collection/:name) | flex | Yes (A-Z) |
| **Projects** | Count of projects in this collection that are in this directory | 80px | Yes |
| **Entities** | Count of distinct entities across those projects | 80px | Yes |
| **Tags** | Union of baseTags from contained projects (pill display, 4 shown + N more) | 200px | No |
| **Top Entities** | Top 3 entities by pageRank in collection (pill display) | 200px | No |

#### Search Modes (Collections Tab)

The search bar supports 3 cross-entity search modes. The user types freely — the system searches across all three simultaneously and shows the best matches.

**Mode 1: By collection name** (default)
- Searches collection name substring match
- Example: typing "Finance" shows "Global Finance Systems"

**Mode 2: By contained project name**
- Searches project names within this directory's collections
- Example: typing "Petrodollar" shows collections that contain the "Petrodollar System" project
- Match indicator: `via project: Petrodollar System` shown below collection name

**Mode 3: By contained entity name**
- Searches entity names across collections in this directory
- Example: typing "IMF" shows all collections that have projects mentioning IMF
- Match indicator: `contains entity: IMF` shown below collection name

**Implementation:** Single search input, 300ms debounce. All three modes run in parallel (3 queries). Results merged and deduplicated by collection name. Match type shown as a subtle indicator below the collection name in results.

#### Entity Filter Pills (Collections Tab)

Below the search bar, a filter row shows active entity and tag filters:

```
┌─ Filters ──────────────────────────────────────────────┐
│ By entity: [IMF ✕] [OPEC ✕] [Fed ✕] +3 more           │
│ By tag:    [oil ✕] [dollar ✕] [hegemony ✕]             │
│                                          [Clear All]    │
└─────────────────────────────────────────────────────────┘
```

- **Entity filter:** Click an entity pill in the "Top Entities" column → adds it as a filter. Shows only collections containing that entity.
- **Tag filter:** Click a tag pill in the "Tags" column → adds it as a filter. Shows only collections whose projects have that tag.
- Filters are AND-chained: collection must match ALL active entity filters AND ALL active tag filters.
- Each filter pill has ✕ to remove. "Clear All" removes all filters.
- Filter pills use the +N overflow pattern (Section 14).

#### Sort Controls

Default sort: alphabetical by name. Click column header to toggle sort. Active sort column shows ▲/▼ indicator.

---

### 6.2 Projects Tab

Shows all projects in this directory.

#### Table Columns

| Column | Data | Width | Sortable |
|--------|------|-------|----------|
| **Name** | Project name (clickable → /project/:uniqueId) | flex | Yes (A-Z) |
| **Collection** | Collection name(s) this project belongs to (clickable → /collection/:name) | 180px | Yes |
| **Entities** | Count of entities in project | 80px | Yes |
| **Tags** | baseTags from project (pill display, 4 shown + N more) | 200px | No |
| **Date** | Created date (from CREATED_ON DateTime node) | 100px | Yes (newest first) |
| **Source** | 📄 icon (clickable → /source/:htmlPath) | 40px | No |

#### Search (Projects Tab)

Searches project name substring match. 300ms debounce.

#### Filters (Projects Tab)

```
┌─ Filters ──────────────────────────────────────────────┐
│ By collection: [Global Finance Systems ✕]               │
│ By tag:        [oil ✕] [geopolitics ✕]                  │
│ By entity:     [IMF ✕]                                  │
│                                          [Clear All]    │
└─────────────────────────────────────────────────────────┘
```

- **Collection filter:** Click collection name in table → adds filter. Shows only projects in that collection.
- **Tag filter:** Click tag pill → adds filter. Shows only projects with that tag.
- **Entity filter:** Select from autocomplete dropdown. Shows only projects mentioning that entity.
- All AND-chained.

#### Orphan Project Indicator

Projects not belonging to ANY collection get an amber badge:

```
┌──────────────────────────────────────────────────────────────┐
│  Petrodollar System    ⚠ No collection    5 entities  oil..  │
└──────────────────────────────────────────────────────────────┘
```

- Badge: amber background (`var(--warning)` at 15% opacity), amber text
- Tooltip: "This project is not in any collection. Add it to a collection to include it in graph views."
- Orphan projects are still shown in the directory via IN_DIRECTORY relationship

---

### 6.3 Entities Tab

Shows all entities that appear in projects within this directory.

#### Table Columns

| Column | Data | Width | Sortable |
|--------|------|-------|----------|
| **Name** | Entity name (clickable → /entity/:name) | flex | Yes (A-Z) |
| **Category** | Category badge (colored dot + name) | 120px | Yes |
| **Projects** | Count of projects mentioning this entity (within this directory) | 80px | Yes |
| **Collections** | Collection names where this entity appears (pill display, 3 shown + N more) | 200px | No |
| **Bridge** | Bridge tier badge (Gold/Silver/Bronze/—) | 80px | Yes |
| **Influence** | Horizontal bar (0-10 scale from pageRank percentile) | 100px | Yes |

#### Search (Entities Tab)

Searches entity name substring match. 300ms debounce.

#### Filters (Entities Tab)

```
┌─ Filters ──────────────────────────────────────────────┐
│ By category:   [Organization ✕] [Person ✕]              │
│ By bridge:     [Gold ✕] [Silver ✕]                      │
│ By collection: [Global Finance Systems ✕]               │
│                                          [Clear All]    │
└─────────────────────────────────────────────────────────┘
```

- **Category filter:** Click category badge → adds filter. Shows only entities of that category.
- **Bridge filter:** Click bridge badge → adds filter. Shows only entities of that tier.
- **Collection filter:** Click collection pill → adds filter. Shows only entities in that collection.
- All AND-chained.

---

## 7. Collection View — Full Collection Console

The richest page. A complete management console for a single collection.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Top Nav: Home > Research > Global Finance Systems                │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─── Header ────────────────────────────────────────────────┐   │
│  │  📊 Global Finance Systems                                 │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  Systems analysis of global financial mechanisms,   │   │   │
│  │  │  dollar hegemony, and institutional power flows.    │   │   │
│  │  │                                          ✏️ Edit    │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  │                                                            │   │
│  │  [🔬 Open Graph Studio]  [📥 Export Collection]            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─── Stats Bar ─────────────────────────────────────────────┐   │
│  │  7 Projects  │  287 Entities  │  217 Relationships  │      │   │
│  │  24 Chains   │  41 Bridges    │  14 Categories      │      │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─── Projects ──────────────────────────────────────────────┐   │
│  │  Projects in this Collection          [+ Add Project]      │   │
│  │                                                            │   │
│  │  ┌──────────────────────────────────────────────────┐     │   │
│  │  │  Search / Filter / Sort controls                  │     │   │
│  │  └──────────────────────────────────────────────────┘     │   │
│  │                                                            │   │
│  │  ┌── Project Row ──────────────────────────────────┐     │   │
│  │  │  Petrodollar System         36 entities          │     │   │
│  │  │  oil, dollar, hegemony      2026-04-06   📄  ✕  │     │   │
│  │  └──────────────────────────────────────────────────┘     │   │
│  │  ... (more rows)                                          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─── Bridge Entities ───────────────────────────────────────┐   │
│  │  41 entities spanning multiple projects                    │   │
│  │                                                            │   │
│  │  GOLD (3+ projects)                                        │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐                │   │
│  │  │ IMF  │ │China │ │ US   │ │Saudi Arab│                │   │
│  │  │ Org  │ │Place │ │Place │ │ Place    │                │   │
│  │  │ 5 pr │ │ 4 pr │ │ 4 pr │ │  3 pr   │                │   │
│  │  └──────┘ └──────┘ └──────┘ └──────────┘                │   │
│  │                                                            │   │
│  │  SILVER (2 projects)                                       │   │
│  │  (grid of silver bridge entity cards)                      │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─── Top Entities by Influence ─────────────────────────────┐   │
│  │  (ranked list, top 10 by pageRank)                         │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─── Category Breakdown ────────────────────────────────────┐   │
│  │  (horizontal bar chart or stat grid showing entity count   │   │
│  │   per category)                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─── Causal Chains ────────────────────────────────────────┐   │
│  │  24 chains across 7 projects                               │   │
│  │  (collapsible list of chains with entity → entity links)   │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 7.1 Collection Header

```
┌─── Header ────────────────────────────────────────────────────┐
│  📊 Global Finance Systems                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Systems analysis of global financial mechanisms,       │   │
│  │  dollar hegemony, and institutional power flows.        │   │
│  │                                              ✏️ Edit    │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  [🔬 Open Graph Studio]  [📥 Export Collection]                │
└────────────────────────────────────────────────────────────────┘
```

- **Name:** Large heading, `var(--text-primary)`, 20px font
- **Description:** Editable text block in a `var(--surface-raised)` box. ✏️ Edit button toggles edit mode (textarea + Save/Cancel). Stored as `Collection.description` in Neo4j.
- **Open Graph Studio:** Primary action button. Navigates to `/graph/Global Finance Systems`.
  - Styling: `var(--accent)` background, white text, prominent
- **Export Collection:** Secondary action button. Triggers export flow (spawn `export_collection.py`)
  - Styling: `var(--surface-hover)` background, `var(--text-secondary)` text

### 7.2 Stats Bar

Horizontal strip showing key metrics:

```
┌──────────┬──────────────┬────────────────┬──────────┬──────────┬──────────────┐
│ 7         │ 287           │ 217             │ 24        │ 41        │ 14            │
│ Projects  │ Entities      │ Relationships   │ Chains    │ Bridges   │ Categories    │
└──────────┴──────────────┴────────────────┴──────────┴──────────┴──────────────┘
```

- Background: `var(--surface)`
- Each stat: large number on top, label below, separated by `var(--border)` vertical lines
- Numbers use `var(--text-primary)`, labels use `var(--text-muted)`

### 7.3 Projects Section

List of projects in this collection with management controls.

#### Project Row

```
┌──────────────────────────────────────────────────────────────┐
│  Petrodollar System                    36 entities            │
│  oil, dollar, hegemony, OPEC           2026-04-06   📄   ✕   │
└──────────────────────────────────────────────────────────────┘
```

| Element | Action |
|---------|--------|
| Project name | Click → `/project/:uniqueId` |
| Entity count | Display only |
| Tags | Pill display (4 shown + N more) |
| Date | From CREATED_ON DateTime node |
| 📄 icon | Click → `/source/:htmlPath` |
| ✕ button | Remove project from collection (see below) |

#### Search + Filter + Sort

- **Search:** Project name substring match
- **Sort:** By name (A-Z), by date (newest), by entity count (desc)
- **Filter by tag:** Click tag pill → filter to projects with that tag

#### Add Project (+)

"Add Project" button opens the **AddProjectModal**:

```
┌─── Add Project to Global Finance Systems ─────────────────┐
│                                                             │
│  🔍 Search projects...                                     │
│                                                             │
│  ── Recommended Projects (GDS) ────────────────────────── │
│  Projects that share entities with this collection:         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Water Wars in South Asia          12 shared entities│  │
│  │  Skills > Geopolitics              [+ Add]           │  │
│  │  Shared: IMF, World Bank, China, OPEC, ...           │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  African Resource Extraction       8 shared entities │  │
│  │  Research > Resource Economics      [+ Add]           │  │
│  │  Shared: China, World Bank, IMF, ...                  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ── All Available Projects ────────────────────────────── │
│  (projects NOT in this collection, searchable)              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Quantum Computing Basics          0 shared entities │  │
│  │  Skills > Technology                [+ Add]           │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  [Done]                                                     │
└─────────────────────────────────────────────────────────────┘
```

**Recommendation algorithm:**

For each project NOT in this collection, count how many of its entities overlap with the collection's entities:

```cypher
// Q-F10: Recommend projects for a collection
MATCH (c:Collection {name: $collectionName})<-[:BELONGS_TO]-(cp:Project)
MATCH (e:Entity)-[:MENTIONED_IN]->(cp)
WITH c, collect(DISTINCT e) AS collectionEntities
MATCH (candidate:Project)
WHERE NOT (candidate)-[:BELONGS_TO]->(c)
MATCH (ce:Entity)-[:MENTIONED_IN]->(candidate)
WHERE ce IN collectionEntities
WITH candidate, collect(DISTINCT ce.name) AS sharedEntityNames, count(DISTINCT ce) AS sharedCount
WHERE sharedCount > 0
RETURN candidate.name AS name, candidate.uniqueId AS uniqueId,
  candidate.domain AS domain, candidate.subdomain AS subdomain,
  sharedEntityNames, sharedCount
ORDER BY sharedCount DESC
LIMIT 10
```

- Recommendations sorted by shared entity count (descending)
- Shared entity names shown as pills (4 shown + N more pattern)
- Projects with 0 shared entities shown below recommendations under "All Available Projects"
- Search filters the full list (both recommended and non-recommended)

**Add action:**
```cypher
MATCH (p:Project {uniqueId: $uid}), (c:Collection {name: $collectionName})
CREATE (p)-[:BELONGS_TO]->(c)
```

After adding: refresh collection stats, refresh project list.

#### Remove Project (✕)

The ✕ button on each project row removes it from this collection.

**Before removing, check if this is the project's LAST collection:**

```cypher
MATCH (p:Project {uniqueId: $uid})-[:BELONGS_TO]->(c:Collection)
RETURN count(c) AS collectionCount
```

- If `collectionCount > 1`: Simple confirm dialog. "Remove Petrodollar System from Global Finance Systems?"
- If `collectionCount == 1`: **Warning dialog.** "This is the last collection for Petrodollar System. Removing it will make this project an orphan (no collection). It will still be visible in its directory but won't appear in any graph view. Continue?"

**Remove action:**
```cypher
MATCH (p:Project {uniqueId: $uid})-[r:BELONGS_TO]->(c:Collection {name: $collectionName})
DELETE r
```

After removing: refresh collection stats. If project became orphan, it gets the amber badge in Directory View.

### 7.4 Bridge Entities Section

Shows entities spanning multiple projects within this collection. Grouped by tier.

#### Bridge Entity Mini-Card

```
┌──────────────┐
│  IMF          │  ← Name (clickable → /entity/IMF)
│  Organization │  ← Category badge
│  5 projects   │  ← Project count within collection
│  ◉ Gold       │  ← Bridge tier badge
└──────────────┘
```

- Cards displayed in a flex-wrap grid
- Gold bridges first, then Silver, then Bronze
- Each card: `var(--surface-raised)` background, bridge tier color as left border
- Click name → navigates to Entity View

### 7.5 Top Entities by Influence

Ranked list showing top 10 entities by pageRank within this collection:

```
 1. IMF                  ████████████████████  Very High  Organization
 2. Federal Reserve      █████████████████░░░  High       Organization
 3. World Bank           ██████████████░░░░░░  High       Organization
 4. China                █████████████░░░░░░░  High       Place
 ...
```

- Rank number + entity name (clickable) + influence bar + label + category badge
- Bar is 0-10 scale, same as Component 02's MetricBar

### 7.6 Category Breakdown

Shows entity count per category for this collection:

```
Organization  ████████████████████████████████████  45
Concept       ██████████████████████████████        38
Person        █████████████████████                 23
Place         ███████████████████████████           31
System        ██████████████████████                28
Event         ██████████████                        18
...
```

- Horizontal bars, sorted by count descending
- Bar color matches category color (same as Component 02's 14-color system)
- Category name is clickable → navigates to Directory View Entities tab with that category pre-filtered

### 7.7 Causal Chains Section

Shows all causal chains across projects in this collection:

```
▶ Dollar Hegemony Chain (4 links) — Petrodollar System
▼ Debt Trap Mechanism (3 links) — IMF: Lender of Last Resort
    IMF → (CAUSES) → Structural Adjustment
    Structural Adjustment → (ENABLES) → Debt Dependency
    Debt Dependency → (BLOCKS) → Economic Sovereignty
```

- Collapsible per chain. Collapsed shows: chain name + link count + project name
- Expanded shows: ordered entity → entity links with relationship type and explanation
- Entity names in chains are clickable → `/entity/:name`
- Project name is clickable → `/project/:uniqueId`

---

## 8. Project View — Info Card Stack

A full profile page for a single project. 8 collapsible sections showing every facet.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Top Nav: Home > Research > Global Finance Systems >              │
│           Petrodollar System                                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  📄 Petrodollar System                                            │
│  Research > Geopolitics > Energy Finance                          │
│  Tags: oil, dollar, hegemony, OPEC, Saudi Arabia                  │
│  Created: 2026-04-06                                              │
│  Collections: Global Finance Systems, Energy Research             │
│                                                                    │
│  [📄 View Source Document]  [🔬 Open in Graph Studio]             │
│                                                                    │
│  ┌─── 1. Summary ──────────────────────── [▼ expanded] ──────┐  │
│  │  The petrodollar system describes the agreement between     │  │
│  │  the United States and Saudi Arabia following the 1973      │  │
│  │  oil crisis... (200+ words)                                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 2. Stats ────────────────────────── [▼ expanded] ──────┐  │
│  │  36 Entities  │  26 Relationships  │  3 Causal Chains      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 3. Entities (36) ───────────────── [▼ expanded] ──────┐  │
│  │  ● IMF              Organization   ████████  High          │  │
│  │  ● OPEC             Organization   ██████    Medium        │  │
│  │  ● Saudi Arabia     Place          ██████    Medium        │  │
│  │  ... (sorted by pageRank)                                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 4. Relationships (26) ─────────── [▶ collapsed] ──────┐  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 5. Causal Chains (3) ─────────── [▶ collapsed] ───────┐  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 6. Narrative Flow ────────────── [▶ collapsed] ───────┐  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 7. Timeline ─────────────────── [▶ collapsed] ────────┐  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 8. Related Projects ─────────── [▶ collapsed] ────────┐  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 8.1 Project Header

| Element | Source | Action |
|---------|--------|--------|
| Project name | `Project.name` | Display |
| Directory > Domain > Subdomain | `Project.directory`, `Project.domain`, `Project.subdomain` | Directory clickable → `/directory/:name` |
| Tags | `Project.baseTags[]` | Pill display |
| Created date | `DateTime` node via `CREATED_ON` | Display |
| Collections | Collection names via `BELONGS_TO` | Each clickable → `/collection/:name` |
| View Source Document | `Project.htmlPath` | Click → `/source/:htmlPath` |
| Open in Graph Studio | Navigates to first collection's graph | Click → `/graph/:collectionName` |

### 8.2 Section Details

#### Section 1: Summary (default EXPANDED)
- Project summary text (200+ words from extraction)
- Full text, no truncation
- `var(--text-secondary)` color, 14px line-height 1.6

#### Section 2: Stats (default EXPANDED)
- Same stats bar pattern as Collection View
- Shows: Entity count, Relationship count, Causal Chain count

#### Section 3: Entities (default EXPANDED)
- Table: Name (clickable → /entity), Category badge, Influence bar, Bridge badge
- Sorted by pageRank descending (most influential first)
- All entity names are clickable links

#### Section 4: Relationships (default COLLAPSED)
- Table: Source entity → relType → Target entity | causalClassification badge | magnitude | evidenceStrength badge
- Sorted by magnitude (foundational first)
- All entity names clickable
- Click row to expand → shows description and evidence quote

#### Section 5: Causal Chains (default COLLAPSED)
- Same chain display as Collection View (Section 7.7)
- But filtered to only chains belonging to this project
- Entity names clickable

#### Section 6: Narrative Flow (default COLLAPSED)
- Ordered list from `Project.narrativeFlow[]`
- Each item: index number + narrative text
- Simple numbered list, no entity linking needed

#### Section 7: Timeline (default COLLAPSED)
- TemporalEvent nodes linked to this project via `BELONGS_TO_PROJECT`
- Ordered by `phaseIndex`
- Each event: phase index + label + period + linked entities (from FIRST_APPEARS_IN)
- Entity names clickable

#### Section 8: Related Projects (default COLLAPSED)
- Projects that share entities with this project (GDS-based recommendation)
- Ordered by shared entity count descending

```cypher
// Q-F14: Related projects by shared entities
MATCH (p:Project {uniqueId: $uid})
MATCH (e:Entity)-[:MENTIONED_IN]->(p)
WITH p, collect(DISTINCT e) AS myEntities
MATCH (e2:Entity)-[:MENTIONED_IN]->(other:Project)
WHERE other <> p AND e2 IN myEntities
RETURN other.name AS name, other.uniqueId AS uniqueId,
  other.domain AS domain, count(DISTINCT e2) AS sharedEntities
ORDER BY sharedEntities DESC
LIMIT 10
```

- Each related project row: name (clickable → /project), domain, shared entity count
- Shared entity names shown as pills (4 + N more)

---

## 9. Entity View — Cross-Document Profile

A comprehensive profile showing one entity across ALL projects and collections.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Top Nav: Home > Entity: IMF                                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ● IMF                                    Organization            │
│  International Monetary Fund                                      │
│  Also known as: The Fund, IMF                                     │
│                                                                    │
│  The International Monetary Fund is a financial institution        │
│  that provides monetary cooperation and financial stability        │
│  worldwide... (full definition)                                    │
│                                                                    │
│  ┌─── 1. Metrics ──────────────────────── [▼ expanded] ──────┐  │
│  │  Influence:     ████████████████████  Very High (98th pctl)│  │
│  │  Bridge Score:  ████████████░░░░░░░░  High (72nd pctl)     │  │
│  │  Connections:   14                                          │  │
│  │  Cross-Document: 5 projects   ◉ GOLD                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 2. Mentioned In (5 projects) ───── [▼ expanded] ──────┐  │
│  │                                                             │  │
│  │  ▼ Petrodollar System (Research)                            │  │
│  │    "Enforcer of dollar-based lending conditionality..."     │  │
│  │    📄 View Source                                           │  │
│  │                                                             │  │
│  │  ▼ IMF: Lender of Last Resort (Research)                    │  │
│  │    "Primary international lender that provides emergency    │  │
│  │    liquidity with policy reform conditions attached."       │  │
│  │    📄 View Source                                           │  │
│  │                                                             │  │
│  │  ▶ Bretton Woods (collapsed)                                │  │
│  │  ▶ Central Banks (collapsed)                                │  │
│  │  ▶ Green Revolution Trap (collapsed)                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 3. Relationships (14) ─────────── [▼ expanded] ──────┐  │
│  │  ● Federal Reserve    COOPERATES_WITH   Significant        │  │
│  │  ● OPEC               REGULATES         Foundational       │  │
│  │  ● World Bank         COOPERATES_WITH   Significant        │  │
│  │  ... (all 14, each row expandable for description)          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 4. Chain Participation (3) ──── [▶ collapsed] ─────────┐  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 5. Similar Entities ──────────── [▶ collapsed] ────────┐  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 6. Collections ──────────────── [▶ collapsed] ─────────┐  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 9.1 Entity Header

- Category color dot + entity name (large, 18px)
- Full name / alias expansion
- Aliases listed below name
- Full definition text (no truncation)

### 9.2 Section Details

#### Section 1: Metrics (default EXPANDED)
- Same metric bars as Component 02 RSB (Influence, Bridge Score, Connections, Cross-Document)
- Human-readable labels, not raw GDS names
- Bridge tier badge (Gold/Silver/Bronze)
- Percentile shown in parentheses

#### Section 2: Mentioned In (default EXPANDED)
- Lists ALL projects this entity appears in
- Each project: name (clickable → /project), directory in parentheses
- Expanded: shows full role text from `MENTIONED_IN.role`
- 📄 icon → opens source document
- First 2 projects expanded by default, rest collapsed
- This is the researcher's core view — understanding an entity across contexts

#### Section 3: Relationships (default EXPANDED)
- All RELATES_TO edges involving this entity
- Each row: target entity name (clickable → /entity), relType, causalClassification badge, magnitude, evidenceStrength badge
- Click row → expands to show description and evidence quote
- Sorted by magnitude (foundational first)

#### Section 4: Chain Participation (default COLLAPSED)
- Causal chains that include this entity
- Same chain display format as Section 7.7
- Entity names clickable

#### Section 5: Similar Entities (default COLLAPSED)
- From SIMILAR_TO relationships
- Each row: entity name (clickable → /entity), category badge, similarity score (0-1)
- Sorted by similarity descending

#### Section 6: Collections (default COLLAPSED)
- All collections containing projects that mention this entity
- Each collection: name (clickable → /collection), project count within that collection that mention this entity
- Useful for understanding where in the knowledge base this entity lives

---

## 10. Source Viewer — Document Reader

A dark-themed HTML reader for viewing the original source documents stored by Component 01.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Top Nav: Home > Research > Petrodollar System > Source            │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─── Source Document ──────────────────────────────────────┐   │
│  │                                                           │   │
│  │  (HTML content rendered in an iframe with dark theme      │   │
│  │   override, or in a styled div)                           │   │
│  │                                                           │   │
│  │  Full scrollable document content...                      │   │
│  │                                                           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Implementation

- **Path resolution:** Uses `resolveSourceUrl(htmlPath)` from Component 02's `utils/paths.ts`
- **Dev mode:** Vite plugin serves files at `/source-viewer/`
- **Electron (future):** `file://` protocol
- **Display:** `<iframe>` with `src={resolveSourceUrl(htmlPath)}` and dark theme injection
- **Dark theme injection:** Post-load script sets `body { background: var(--bg); color: var(--text-primary); }` on the iframe content

### Alternative: Styled div

If iframe dark-theming proves unreliable, fetch the HTML as text and render inside a styled div with `dangerouslySetInnerHTML` (content is trusted — we generated it in Component 01).

---

## 11. Graph Studio Integration

Graph Studio (Component 02) is embedded as a React component at the `/graph/:collectionName` route.

### Embedding Strategy — Adapter Pattern

All imports from Component 02 go through a single `adapters/` folder. No page or component in Component 03 imports directly from `02-graph-studio/src/`. This creates one clean seam: if Component 02's internals ever change, only the adapter files break.

```
src/adapters/
├── graph-studio.tsx         ← Wraps App.tsx, exports <GraphStudioAdapter>
├── neo4j-service.ts         ← Re-exports getSession(), closeDriver() from C02
├── source-paths.ts          ← Re-exports resolveSourceUrl() from C02
└── graph-stores.ts          ← Re-exports useGraphStore, useSelectionStore (read-only)
```

#### GraphStudioAdapter (the primary integration)

```typescript
// src/adapters/graph-studio.tsx
// ONLY file that imports Component 02's App.tsx

import GraphStudioApp from '../../../02-graph-studio/src/App'

interface GraphStudioAdapterProps {
  collectionName: string
}

export default function GraphStudioAdapter({ collectionName }: GraphStudioAdapterProps) {
  return (
    <div className="h-full w-full">
      <GraphStudioApp initialCollection={collectionName} />
    </div>
  )
}
```

#### Neo4j Service Adapter

```typescript
// src/adapters/neo4j-service.ts
// Single import point for Neo4j driver — no second driver instance

export { getSession, closeDriver, testConnection } from '../../../02-graph-studio/src/services/neo4j'
```

#### Source Path Adapter

```typescript
// src/adapters/source-paths.ts
export { resolveSourceUrl } from '../../../02-graph-studio/src/utils/paths'
```

#### Store Adapter (read-only)

```typescript
// src/adapters/graph-stores.ts
// Read-only access to Component 02 stores — for breadcrumb/context only
export { useGraphStore } from '../../../02-graph-studio/src/stores/graph-store'
export { useSelectionStore } from '../../../02-graph-studio/src/stores/selection-store'
```

### Why Adapters

- **Single breakpoint.** If Component 02 restructures, fix 4 adapter files, not every page.
- **Clean dependency direction.** Pages import from `adapters/`, never from `../../02-graph-studio/`.
- **Electron-ready.** Adapter layer is the seam where Component 05 can add IPC, lazy loading, or error boundaries.
- **Testable.** Mock the adapter folder for Frontend unit tests without loading Component 02.

### Pages use adapters, never Component 02 directly:

```typescript
// pages/GraphPage.tsx — CORRECT
import GraphStudioAdapter from '../adapters/graph-studio'

// pages/GraphPage.tsx — WRONG, never do this
// import GraphStudioApp from '../../../02-graph-studio/src/App'
```

### Integration Points

| What | Adapter File | Exports |
|------|-------------|---------|
| **Graph visualization** | `graph-studio.tsx` | `<GraphStudioAdapter collectionName={...} />` |
| **Neo4j driver** | `neo4j-service.ts` | `getSession()`, `closeDriver()`, `testConnection()` |
| **Source URL resolution** | `source-paths.ts` | `resolveSourceUrl(htmlPath)` |
| **Graph Studio state** | `graph-stores.ts` | `useGraphStore` (read-only), `useSelectionStore` (read-only) |
| **CSS tokens** | Shared `globals.css` | Imported in Frontend's own styles (not through adapter) |

### Modification to Graph Studio

One small change needed: Graph Studio's `App.tsx` currently gates on `CollectionPicker`. When embedded from Frontend, we need to bypass the picker.

**Approach:** Add an optional `initialCollection` prop to `App`:
```typescript
export default function App({ initialCollection }: { initialCollection?: string }) {
  // If initialCollection is provided, skip the picker
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    initialCollection ?? null
  )
  // ... rest unchanged
}
```

This is the ONLY modification to Component 02 code. Everything else is additive in Component 03.

**Decision D41:** Graph Studio receives optional `initialCollection` prop to skip its built-in collection picker when embedded in the Frontend.
**Decision D61:** All Component 02 imports go through `src/adapters/` — no page or component imports directly from `02-graph-studio/src/`.

---

## 12. Settings Page

Minimal configuration page for Neo4j connection and app preferences.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Top Nav: Home > Settings                                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ⚙ Settings                                                      │
│                                                                    │
│  ┌─── Neo4j Connection ─────────────────────────────────────┐   │
│  │                                                           │   │
│  │  URI:      [bolt://localhost:7687         ]               │   │
│  │  User:     [neo4j                         ]               │   │
│  │  Password: [••••••••                      ]               │   │
│  │  Database: [memorytonic                   ]               │   │
│  │                                                           │   │
│  │  Status: ● Connected (287 entities)                       │   │
│  │                                                           │   │
│  │  [Test Connection]  [Save]                                │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─── About ────────────────────────────────────────────────┐   │
│  │  MemoryTonic v4.0.0                                       │   │
│  │  Knowledge graph for humans and AI agents.                │   │
│  │  $5 one-time license. Everything local.                   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Neo4j Connection

- Fields pre-filled from current env variables
- "Test Connection" button: calls `testConnection()` from Component 02's `neo4j.ts`
- Shows green dot + entity count on success, red dot + error on failure
- "Save" button: saves to localStorage (Electron will use electron-store in Component 05)

### Data Persistence

Settings stored in `localStorage`:
```typescript
interface AppSettings {
  neo4j: {
    uri: string
    user: string
    password: string
    database: string
  }
}
```

Component 05 (Electron) will migrate this to `electron-store` for persistent cross-session storage.

---

## 13. Cross-Navigation Contract

**The single most important UX principle in the Frontend: every data name is a clickable link.**

### Clickable Elements Map

| Element | Appears In | Navigates To |
|---------|-----------|-------------|
| **Entity name** | Directory Entities tab, Collection bridge cards, Collection top entities, Project entities list, Project relationships, Entity relationships, Entity similar entities, Causal chain links, Exploration card connections | `/entity/:name` |
| **Project name** | Directory Projects tab, Collection projects list, Entity "Mentioned In" list, Entity "Related Projects", Causal chain project attribution, Project "Related Projects" | `/project/:uniqueId` |
| **Collection name** | Directory Collections tab, Entity "Collections" section, Project header "Collections", Project collections list | `/collection/:name` |
| **Directory name** | Home directory cards, Project header directory | `/directory/:name` |
| **Source document icon (📄)** | Collection project rows, Project header, Entity "Mentioned In" | `/source/:htmlPath` |
| **Category badge** | Directory Entities tab, Collection category breakdown | `/directory/:name#entities` with category pre-filtered |
| **Graph Studio button** | Home quick-launch, Collection header | `/graph/:collectionName` |

### Link Styling

```css
.data-link {
  color: var(--accent);
  cursor: pointer;
  text-decoration: none;
  transition: opacity 0.15s ease;
}
.data-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}
```

### Navigation State Preservation

When navigating between pages:
- **Filter state is NOT preserved** across page changes (too complex for v1)
- **Scroll position is NOT preserved** (browser default reset-to-top)
- **Breadcrumb tracks the navigation path** so user can go back
- **Browser back/forward** works via history API

---

## 14. Pill & Tag Display Pattern

A universal pattern used across all tables and cards for displaying arrays of short text items.

### The Rule

**Show up to N pills inline, then "+M more" overflow indicator.**

| Context | N (visible pills) | Overflow text |
|---------|-------------------|---------------|
| Table cells (tags, entities) | 4 | `+3 more` |
| Filter bars | 5 | `+2 more` |
| Bridge entity shared names | 4 | `+8 more` |
| Header tags | 6 | `+3 more` |

### Pill Anatomy

```
┌────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐
│  oil   │ │  dollar  │ │ hegemony │ │  OPEC  │ │ +3 more  │
└────────┘ └──────────┘ └──────────┘ └────────┘ └──────────┘
```

### Pill Styling

```css
.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;       /* full round */
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

/* Tag pill (baseTags) */
.pill-tag {
  background: var(--surface-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}

/* Entity pill (entity names in filter/display) */
.pill-entity {
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid rgba(96, 165, 250, 0.15);
  cursor: pointer;
}

/* Category pill */
.pill-category {
  /* Uses category-specific background at 15% opacity */
  /* Text color matches category color */
}

/* Overflow indicator */
.pill-overflow {
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border: 1px dashed var(--border);
}
.pill-overflow:hover {
  color: var(--text-secondary);
  border-color: var(--text-muted);
}
```

### Overflow Click Behavior

Clicking "+N more" shows a popover/tooltip listing ALL items:

```
┌─── All Tags ─────────────┐
│  oil                      │
│  dollar                   │
│  hegemony                 │
│  OPEC                     │
│  Saudi Arabia             │
│  petrodollar              │
│  recycling                │
└───────────────────────────┘
```

Popover: `var(--surface-raised)` background, `var(--border)` border, 8px padding. Positioned below the "+N more" pill. Click outside to dismiss.

### Component API

```typescript
interface PillListProps {
  items: string[]
  maxVisible?: number          // default 4
  variant: 'tag' | 'entity' | 'category' | 'collection'
  onItemClick?: (item: string) => void   // For clickable pills (entity names, etc.)
  onFilterAdd?: (item: string) => void   // For filter-addable pills
}
```

---

## 15. Neo4j Queries — Complete Mapping

Every query the Frontend makes, distinct from Component 02's queries. Prefixed Q-F (Query-Frontend) to distinguish from Component 02's Q1-Q8.

### Q-F1: Load All Directories (Home Screen)

```cypher
MATCH (d:DirectoryCategory)
OPTIONAL MATCH (p:Project)-[:IN_DIRECTORY]->(d)
OPTIONAL MATCH (p)-[:BELONGS_TO]->(c:Collection)
OPTIONAL MATCH (e:Entity)-[:MENTIONED_IN]->(p)
RETURN d.name AS name,
  d.description AS description,
  count(DISTINCT p) AS projectCount,
  count(DISTINCT c) AS collectionCount,
  count(DISTINCT e) AS entityCount
ORDER BY d.name
```

**Service:** `frontend-queries.ts → fetchAllDirectories()`
**Store:** `directory-store.directories`
**UI:** Home Screen directory cards

### Q-F2: Load Directory Collections (Directory View, Collections Tab)

```cypher
MATCH (d:DirectoryCategory {name: $dirName})
MATCH (p:Project)-[:IN_DIRECTORY]->(d)
MATCH (p)-[:BELONGS_TO]->(c:Collection)
OPTIONAL MATCH (e:Entity)-[:MENTIONED_IN]->(p)
WITH c, collect(DISTINCT p) AS projects, collect(DISTINCT e) AS entities
RETURN c.name AS name,
  size(projects) AS projectCount,
  size(entities) AS entityCount,
  reduce(tags = [], p IN projects | tags + p.baseTags) AS allTags,
  [e IN entities | {name: e.name, pageRank: e.pageRank}][..5] AS topEntities
ORDER BY c.name
```

Note: `allTags` needs post-processing to deduplicate and truncate.

**Service:** `frontend-queries.ts → fetchDirectoryCollections(dirName)`
**Store:** `directory-store.directoryDetail.collections`
**UI:** Directory View → Collections Tab

### Q-F3: Load Directory Projects (Directory View, Projects Tab)

```cypher
MATCH (d:DirectoryCategory {name: $dirName})
MATCH (p:Project)-[:IN_DIRECTORY]->(d)
OPTIONAL MATCH (p)-[:BELONGS_TO]->(c:Collection)
OPTIONAL MATCH (e:Entity)-[:MENTIONED_IN]->(p)
OPTIONAL MATCH (p)-[:CREATED_ON]->(dt:DateTime {type: 'date'})
RETURN p.name AS name, p.uniqueId AS uniqueId,
  p.baseTags AS tags, p.htmlPath AS htmlPath,
  p.domain AS domain, p.subdomain AS subdomain,
  collect(DISTINCT c.name) AS collections,
  count(DISTINCT e) AS entityCount,
  dt.date AS createdDate
ORDER BY p.name
```

**Service:** `frontend-queries.ts → fetchDirectoryProjects(dirName)`
**Store:** `directory-store.directoryDetail.projects`
**UI:** Directory View → Projects Tab

### Q-F4: Load Directory Entities (Directory View, Entities Tab)

```cypher
MATCH (d:DirectoryCategory {name: $dirName})
MATCH (p:Project)-[:IN_DIRECTORY]->(d)
MATCH (e:Entity)-[:MENTIONED_IN]->(p)
OPTIONAL MATCH (p)-[:BELONGS_TO]->(c:Collection)
WITH e, collect(DISTINCT p.name) AS projectNames,
  collect(DISTINCT c.name) AS collectionNames
RETURN e.name AS name, e.category AS category,
  e.pageRank AS pageRank, e.betweenness AS betweenness,
  e.projectCount AS projectCount,
  CASE
    WHEN e.projectCount >= 3 THEN 'gold'
    WHEN e.projectCount = 2 THEN 'silver'
    ELSE 'none'
  END AS bridgeTier,
  size(projectNames) AS dirProjectCount,
  collectionNames
ORDER BY e.pageRank DESC
```

**Service:** `frontend-queries.ts → fetchDirectoryEntities(dirName)`
**Store:** `directory-store.directoryDetail.entities`
**UI:** Directory View → Entities Tab

### Q-F5: Cross-Entity Search — Collections by Project Name

```cypher
MATCH (d:DirectoryCategory {name: $dirName})
MATCH (p:Project)-[:IN_DIRECTORY]->(d)
WHERE toLower(p.name) CONTAINS toLower($searchTerm)
MATCH (p)-[:BELONGS_TO]->(c:Collection)
RETURN DISTINCT c.name AS collectionName,
  collect(DISTINCT p.name) AS matchedProjects
```

**Service:** `frontend-queries.ts → searchCollectionsByProject(dirName, searchTerm)`
**UI:** Directory View → Collections Tab → search results (Mode 2)

### Q-F6: Cross-Entity Search — Collections by Entity Name

```cypher
MATCH (d:DirectoryCategory {name: $dirName})
MATCH (p:Project)-[:IN_DIRECTORY]->(d)
MATCH (e:Entity)-[:MENTIONED_IN]->(p)
WHERE toLower(e.name) CONTAINS toLower($searchTerm)
MATCH (p)-[:BELONGS_TO]->(c:Collection)
RETURN DISTINCT c.name AS collectionName,
  collect(DISTINCT e.name) AS matchedEntities
```

**Service:** `frontend-queries.ts → searchCollectionsByEntity(dirName, searchTerm)`
**UI:** Directory View → Collections Tab → search results (Mode 3)

### Q-F7: Load Collection Full Detail (Collection View)

```cypher
MATCH (c:Collection {name: $collectionName})
OPTIONAL MATCH (p:Project)-[:BELONGS_TO]->(c)
OPTIONAL MATCH (e:Entity)-[:MENTIONED_IN]->(p)
OPTIONAL MATCH (e)-[r:RELATES_TO]->(e2:Entity)-[:MENTIONED_IN]->(p2:Project)-[:BELONGS_TO]->(c)
OPTIONAL MATCH (cc:CausalChain)-[:BELONGS_TO_PROJECT]->(p)
WITH c, collect(DISTINCT p) AS projects,
  collect(DISTINCT e) AS entities,
  count(DISTINCT r) AS relCount,
  count(DISTINCT cc) AS chainCount
RETURN c.name AS name,
  c.description AS description,
  size(projects) AS projectCount,
  size(entities) AS entityCount,
  relCount AS relationshipCount,
  chainCount AS causalChainCount
```

**Service:** `frontend-queries.ts → fetchCollectionSummary(collectionName)`
**Store:** `collection-store.collectionDetail.summary`
**UI:** Collection View header + stats bar

### Q-F8: Load Collection Projects (Collection View, Projects Section)

```cypher
MATCH (c:Collection {name: $collectionName})<-[:BELONGS_TO]-(p:Project)
OPTIONAL MATCH (e:Entity)-[:MENTIONED_IN]->(p)
OPTIONAL MATCH (p)-[:CREATED_ON]->(dt:DateTime {type: 'date'})
RETURN p.name AS name, p.uniqueId AS uniqueId,
  p.baseTags AS tags, p.htmlPath AS htmlPath,
  p.domain AS domain, p.subdomain AS subdomain,
  count(DISTINCT e) AS entityCount,
  dt.date AS createdDate
ORDER BY p.name
```

**Service:** `frontend-queries.ts → fetchCollectionProjects(collectionName)`
**Store:** `collection-store.collectionDetail.projects`
**UI:** Collection View → Projects section

### Q-F9: Load Collection Bridge Entities (Collection View, Bridges Section)

```cypher
MATCH (c:Collection {name: $collectionName})<-[:BELONGS_TO]-(p:Project)
MATCH (e:Entity)-[:MENTIONED_IN]->(p)
WITH e, count(DISTINCT p) AS inCollectionCount
WHERE inCollectionCount >= 2
RETURN e.name AS name, e.category AS category,
  e.pageRank AS pageRank, e.betweenness AS betweenness,
  inCollectionCount AS projectCount,
  CASE
    WHEN inCollectionCount >= 3 THEN 'gold'
    WHEN inCollectionCount = 2 THEN 'silver'
  END AS tier
ORDER BY inCollectionCount DESC, e.pageRank DESC
```

**Service:** `frontend-queries.ts → fetchCollectionBridges(collectionName)`
**Store:** `collection-store.collectionDetail.bridges`
**UI:** Collection View → Bridge Entities section

### Q-F10: Recommend Projects for Collection (AddProjectModal)

```cypher
MATCH (c:Collection {name: $collectionName})<-[:BELONGS_TO]-(cp:Project)
MATCH (e:Entity)-[:MENTIONED_IN]->(cp)
WITH c, collect(DISTINCT e) AS collectionEntities
MATCH (candidate:Project)
WHERE NOT (candidate)-[:BELONGS_TO]->(c)
MATCH (ce:Entity)-[:MENTIONED_IN]->(candidate)
WHERE ce IN collectionEntities
WITH candidate, collect(DISTINCT ce.name) AS sharedEntityNames,
  count(DISTINCT ce) AS sharedCount
WHERE sharedCount > 0
RETURN candidate.name AS name, candidate.uniqueId AS uniqueId,
  candidate.domain AS domain, candidate.subdomain AS subdomain,
  sharedEntityNames, sharedCount
ORDER BY sharedCount DESC
LIMIT 10
```

**Service:** `frontend-queries.ts → fetchProjectRecommendations(collectionName)`
**Store:** `collection-store.recommendations`
**UI:** AddProjectModal → Recommended Projects section

### Q-F11: Load Project Full Detail (Project View)

```cypher
MATCH (p:Project {uniqueId: $uid})
OPTIONAL MATCH (p)-[:IN_DIRECTORY]->(d:DirectoryCategory)
OPTIONAL MATCH (p)-[:BELONGS_TO]->(c:Collection)
OPTIONAL MATCH (p)-[:CREATED_ON]->(dt:DateTime {type: 'date'})
RETURN p {
  .name, .uniqueId, .summary, .narrativeFlow, .domain, .subdomain,
  .baseTags, .htmlPath
} AS project,
  d.name AS directory,
  collect(DISTINCT {name: c.name}) AS collections,
  dt.date AS createdDate
```

**Service:** `frontend-queries.ts → fetchProjectDetail(uniqueId)`
**Store:** `project-store.projectDetail`
**UI:** Project View header

### Q-F12: Load Project Entities (Project View, Entities Section)

```cypher
MATCH (p:Project {uniqueId: $uid})
MATCH (e:Entity)-[m:MENTIONED_IN]->(p)
RETURN e.name AS name, e.category AS category,
  e.pageRank AS pageRank, e.projectCount AS projectCount,
  m.role AS role,
  CASE
    WHEN e.projectCount >= 3 THEN 'gold'
    WHEN e.projectCount = 2 THEN 'silver'
    ELSE 'none'
  END AS bridgeTier
ORDER BY e.pageRank DESC
```

**Service:** `frontend-queries.ts → fetchProjectEntities(uniqueId)`
**Store:** `project-store.projectDetail.entities`
**UI:** Project View → Entities section

### Q-F13: Load Project Relationships (Project View, Relationships Section)

```cypher
MATCH (p:Project {uniqueId: $uid})
MATCH (e1:Entity)-[:MENTIONED_IN]->(p)
MATCH (e1)-[r:RELATES_TO]->(e2:Entity)-[:MENTIONED_IN]->(p)
WHERE r.projectId = $uid
RETURN e1.name AS source, e2.name AS target,
  r.relType AS relType, r.causalClassification AS causalClassification,
  r.description AS description, r.evidence AS evidence,
  r.evidenceStrength AS evidenceStrength, r.magnitude AS magnitude,
  r.year AS year
ORDER BY CASE r.magnitude
  WHEN 'foundational' THEN 0
  WHEN 'significant' THEN 1
  WHEN 'marginal' THEN 2
  ELSE 3
END
```

**Service:** `frontend-queries.ts → fetchProjectRelationships(uniqueId)`
**Store:** `project-store.projectDetail.relationships`
**UI:** Project View → Relationships section

### Q-F14: Related Projects by Shared Entities (Project View)

```cypher
MATCH (p:Project {uniqueId: $uid})
MATCH (e:Entity)-[:MENTIONED_IN]->(p)
WITH p, collect(DISTINCT e) AS myEntities
MATCH (other:Project)
WHERE other <> p
MATCH (e2:Entity)-[:MENTIONED_IN]->(other)
WHERE e2 IN myEntities
WITH other, collect(DISTINCT e2.name) AS sharedNames,
  count(DISTINCT e2) AS sharedCount
RETURN other.name AS name, other.uniqueId AS uniqueId,
  other.domain AS domain, sharedNames, sharedCount
ORDER BY sharedCount DESC
LIMIT 10
```

**Service:** `frontend-queries.ts → fetchRelatedProjects(uniqueId)`
**Store:** `project-store.projectDetail.relatedProjects`
**UI:** Project View → Related Projects section

### Q-F15: Load Entity Full Profile (Entity View)

```cypher
MATCH (e:Entity {name: $entityName})
OPTIONAL MATCH (e)-[m:MENTIONED_IN]->(p:Project)
OPTIONAL MATCH (p)-[:BELONGS_TO]->(c:Collection)
OPTIONAL MATCH (p)-[:IN_DIRECTORY]->(d:DirectoryCategory)
OPTIONAL MATCH (e)-[r:RELATES_TO]-(other:Entity)
OPTIONAL MATCH (e)-[cl:CHAIN_LINK]-(linked:Entity)
OPTIONAL MATCH (cc:CausalChain {chainId: cl.chainId})
OPTIONAL MATCH (e)-[s:SIMILAR_TO]-(sim:Entity)
RETURN e {
  .name, .category, .definition, .aliases,
  .pageRank, .betweenness, .degree, .projectCount
} AS entity,
  collect(DISTINCT {
    project: p.name, uniqueId: p.uniqueId,
    role: m.role, htmlPath: p.htmlPath,
    directory: d.name, domain: p.domain
  }) AS projects,
  collect(DISTINCT {name: c.name}) AS collections,
  collect(DISTINCT {
    entity: other.name, relType: r.relType,
    causalClassification: r.causalClassification,
    description: r.description, magnitude: r.magnitude,
    evidenceStrength: r.evidenceStrength, year: r.year
  }) AS relationships,
  collect(DISTINCT {
    chainId: cl.chainId, chainName: cc.name,
    entity: linked.name, orderIndex: cl.orderIndex,
    explanation: cl.explanation
  }) AS chainLinks,
  collect(DISTINCT {
    name: sim.name, category: sim.category, similarity: s.similarity
  }) AS similar
```

**Service:** `frontend-queries.ts → fetchEntityProfile(entityName)`
**Store:** `entity-store.entityProfile`
**UI:** Entity View (all sections)

### Q-F16: Add Project to Collection (mutation)

```cypher
MATCH (p:Project {uniqueId: $uid}), (c:Collection {name: $collectionName})
CREATE (p)-[:BELONGS_TO]->(c)
```

**Service:** `frontend-queries.ts → addProjectToCollection(uniqueId, collectionName)`
**Store:** triggers `collection-store.reload()`

### Q-F17: Remove Project from Collection (mutation)

```cypher
MATCH (p:Project {uniqueId: $uid})-[r:BELONGS_TO]->(c:Collection {name: $collectionName})
DELETE r
```

**Service:** `frontend-queries.ts → removeProjectFromCollection(uniqueId, collectionName)`
**Store:** triggers `collection-store.reload()`

### Q-F18: Check Project Collection Count (before remove)

```cypher
MATCH (p:Project {uniqueId: $uid})-[:BELONGS_TO]->(c:Collection)
RETURN count(c) AS collectionCount
```

**Service:** `frontend-queries.ts → getProjectCollectionCount(uniqueId)`
**UI:** Remove project dialog (warning if last collection)

### Q-F19: Create Directory (mutation)

```cypher
CREATE (d:DirectoryCategory {name: $name, description: $description})
```

**Service:** `frontend-queries.ts → createDirectory(name, description)`
**Store:** triggers `directory-store.reload()`

### Q-F20: Update Directory (mutation)

```cypher
MATCH (d:DirectoryCategory {name: $oldName})
SET d.name = $newName, d.description = $description
```

**Service:** `frontend-queries.ts → updateDirectory(oldName, newName, description)`
**Store:** triggers `directory-store.reload()`

### Q-F21: Delete Directory (mutation)

```cypher
MATCH (d:DirectoryCategory {name: $name})
WHERE NOT EXISTS { MATCH (:Project)-[:IN_DIRECTORY]->(d) }
DELETE d
```

The `WHERE NOT EXISTS` guard prevents deleting directories with projects.

**Service:** `frontend-queries.ts → deleteDirectory(name)`
**Store:** triggers `directory-store.reload()`

### Q-F22: Update Collection Description (mutation)

```cypher
MATCH (c:Collection {name: $collectionName})
SET c.description = $description
```

**Service:** `frontend-queries.ts → updateCollectionDescription(collectionName, description)`
**Store:** triggers `collection-store.reload()`

### Q-F23: Create Collection (mutation)

```cypher
MERGE (c:Collection {name: $name})
ON CREATE SET c.collectionId = randomUUID(),
  c.description = $description,
  c.createdAt = datetime()
```

Uses MERGE (not CREATE) to prevent duplicate collection names. Component 01 also uses MERGE for collections — this is consistent. If a collection with the same name already exists, nothing happens (UI should pre-check and show "name already exists" error before running this query).

**Service:** `frontend-queries.ts → createCollection(name, description)`
**Store:** triggers `directory-store.reload()`

### Q-F24: Load Collection Top Entities (Collection View)

```cypher
MATCH (c:Collection {name: $collectionName})<-[:BELONGS_TO]-(p:Project)
MATCH (e:Entity)-[:MENTIONED_IN]->(p)
WITH DISTINCT e
RETURN e.name AS name, e.category AS category, e.pageRank AS pageRank
ORDER BY e.pageRank DESC
LIMIT 10
```

**Service:** `frontend-queries.ts → fetchCollectionTopEntities(collectionName)`
**Store:** `collection-store.collectionDetail.topEntities`
**UI:** Collection View → Top Entities section

### Q-F25: Load Collection Category Breakdown (Collection View)

```cypher
MATCH (c:Collection {name: $collectionName})<-[:BELONGS_TO]-(p:Project)
MATCH (e:Entity)-[:MENTIONED_IN]->(p)
WITH DISTINCT e
RETURN e.category AS category, count(e) AS count
ORDER BY count DESC
```

**Service:** `frontend-queries.ts → fetchCollectionCategories(collectionName)`
**Store:** `collection-store.collectionDetail.categoryBreakdown`
**UI:** Collection View → Category Breakdown section

### Q-F26: Load Collection Causal Chains (Collection View)

```cypher
MATCH (c:Collection {name: $collectionName})<-[:BELONGS_TO]-(p:Project)
MATCH (cc:CausalChain)-[:BELONGS_TO_PROJECT]->(p)
MATCH (a:Entity)-[cl:CHAIN_LINK {chainId: cc.chainId}]->(b:Entity)
RETURN cc.name AS chainName, cc.description AS chainDescription,
  cc.chainId AS chainId, p.name AS projectName, p.uniqueId AS projectId,
  collect({
    source: a.name, target: b.name,
    orderIndex: cl.orderIndex, explanation: cl.explanation
  }) AS links
ORDER BY cc.name
```

**Service:** `frontend-queries.ts → fetchCollectionChains(collectionName)`
**Store:** `collection-store.collectionDetail.causalChains`
**UI:** Collection View → Causal Chains section

### Q-F27: Load Project Causal Chains (Project View)

```cypher
MATCH (p:Project {uniqueId: $uid})
MATCH (cc:CausalChain)-[:BELONGS_TO_PROJECT]->(p)
MATCH (a:Entity)-[cl:CHAIN_LINK {chainId: cc.chainId}]->(b:Entity)
RETURN cc.name AS chainName, cc.description AS chainDescription,
  collect({
    source: a.name, target: b.name,
    orderIndex: cl.orderIndex, explanation: cl.explanation
  }) AS links
ORDER BY cc.name
```

**Service:** `frontend-queries.ts → fetchProjectChains(uniqueId)`
**Store:** `project-store.projectDetail.causalChains`
**UI:** Project View → Causal Chains section

### Q-F28: Load Project Timeline (Project View)

```cypher
MATCH (p:Project {uniqueId: $uid})
MATCH (te:TemporalEvent)-[:BELONGS_TO_PROJECT]->(p)
OPTIONAL MATCH (e:Entity)-[:FIRST_APPEARS_IN]->(te)
RETURN te.phaseIndex AS phaseIndex, te.label AS label, te.period AS period,
  collect(DISTINCT e.name) AS entities
ORDER BY te.phaseIndex
```

**Service:** `frontend-queries.ts → fetchProjectTimeline(uniqueId)`
**Store:** `project-store.projectDetail.timeline`
**UI:** Project View → Timeline section

### Q-F29: Fetch All Collections (Graph Studio Quick-Launch)

```cypher
MATCH (c:Collection)
OPTIONAL MATCH (p:Project)-[:BELONGS_TO]->(c)
RETURN c.name AS name, count(p) AS projectCount
ORDER BY c.name
```

**Service:** `frontend-queries.ts → fetchAllCollections()`
**Store:** `directory-store.allCollections`
**UI:** Home Screen → Graph Studio dropdown, AddProjectModal

---

## 16. Zustand Stores — State Architecture

Five new stores for the Frontend, plus 3 imported read-only from Component 02.

### navigation-store.ts

```typescript
interface NavigationStore {
  // CURRENT ROUTE
  route: Route
  breadcrumbs: BreadcrumbSegment[]

  // HISTORY (for back navigation)
  history: Route[]

  // ACTIONS
  navigate: (route: Route) => void
  goBack: () => void
}

interface BreadcrumbSegment {
  label: string
  route: Route | null         // null = current page (not clickable)
}
```

### directory-store.ts

```typescript
interface DirectoryStore {
  // HOME DATA
  directories: DirectorySummary[]
  allCollections: CollectionListItem[]     // For Graph Studio dropdown
  isLoading: boolean
  error: string | null

  // DIRECTORY DETAIL (one directory at a time)
  directoryDetail: {
    name: string
    description: string | null
    collections: DirectoryCollection[]
    projects: DirectoryProject[]
    entities: DirectoryEntity[]
  } | null

  // FILTERS (per-tab, reset on directory change)
  collectionsTab: {
    search: string
    entityFilters: string[]
    tagFilters: string[]
    sortBy: 'name' | 'projectCount' | 'entityCount'
    sortDir: 'asc' | 'desc'
  }
  projectsTab: {
    search: string
    collectionFilters: string[]
    tagFilters: string[]
    entityFilters: string[]
    sortBy: 'name' | 'date' | 'entityCount'
    sortDir: 'asc' | 'desc'
  }
  entitiesTab: {
    search: string
    categoryFilters: string[]
    bridgeFilters: string[]
    collectionFilters: string[]
    sortBy: 'name' | 'category' | 'projects' | 'influence'
    sortDir: 'asc' | 'desc'
  }

  // ACTIONS
  loadDirectories: () => Promise<void>
  loadDirectoryDetail: (name: string) => Promise<void>
  createDirectory: (name: string, description: string) => Promise<void>
  updateDirectory: (oldName: string, newName: string, desc: string) => Promise<void>
  deleteDirectory: (name: string) => Promise<void>

  // FILTER ACTIONS
  setCollectionSearch: (search: string) => void
  addCollectionEntityFilter: (entity: string) => void
  removeCollectionEntityFilter: (entity: string) => void
  addCollectionTagFilter: (tag: string) => void
  removeCollectionTagFilter: (tag: string) => void
  clearCollectionFilters: () => void
  setCollectionSort: (by: string, dir: string) => void
  // ... similar for projects and entities tabs
}
```

### collection-store.ts

```typescript
interface CollectionStore {
  // COLLECTION DETAIL
  collectionDetail: {
    name: string
    description: string | null
    projectCount: number
    entityCount: number
    relationshipCount: number
    causalChainCount: number
    bridgeCount: number
    categoryCount: number
    projects: CollectionProject[]
    bridges: BridgeEntityItem[]
    topEntities: TopEntityItem[]
    categoryBreakdown: CategoryCount[]
    causalChains: CausalChainItem[]
  } | null
  isLoading: boolean
  error: string | null

  // RECOMMENDATIONS (for AddProjectModal)
  recommendations: ProjectRecommendation[]
  isLoadingRecommendations: boolean

  // PROJECT LIST CONTROLS
  projectSearch: string
  projectSortBy: 'name' | 'date' | 'entityCount'
  projectSortDir: 'asc' | 'desc'
  projectTagFilter: string[]

  // ACTIONS
  loadCollection: (name: string) => Promise<void>
  updateDescription: (name: string, desc: string) => Promise<void>
  addProject: (uniqueId: string, collectionName: string) => Promise<void>
  removeProject: (uniqueId: string, collectionName: string) => Promise<void>
  loadRecommendations: (collectionName: string) => Promise<void>
  setProjectSearch: (search: string) => void
  setProjectSort: (by: string, dir: string) => void
  addProjectTagFilter: (tag: string) => void
  removeProjectTagFilter: (tag: string) => void
}
```

### project-store.ts

```typescript
interface ProjectStore {
  // PROJECT DETAIL
  projectDetail: {
    name: string
    uniqueId: string
    summary: string
    narrativeFlow: string[]
    domain: string
    subdomain: string
    baseTags: string[]
    htmlPath: string
    directory: string
    collections: string[]
    createdDate: string
    entities: ProjectEntity[]
    relationships: ProjectRelationship[]
    causalChains: CausalChainItem[]
    timeline: TimelineEvent[]
    relatedProjects: RelatedProject[]
  } | null
  isLoading: boolean
  error: string | null

  // SECTION COLLAPSE STATE
  expandedSections: Set<string>

  // ACTIONS
  loadProject: (uniqueId: string) => Promise<void>
  toggleSection: (section: string) => void
}
```

### entity-store.ts

```typescript
interface EntityStore {
  // ENTITY PROFILE
  entityProfile: {
    name: string
    category: string
    definition: string
    aliases: string[]
    pageRank: number
    betweenness: number
    degree: number
    projectCount: number
    bridgeTier: 'gold' | 'silver' | 'bronze' | 'none'
    projects: EntityProjectMention[]
    collections: string[]
    relationships: EntityRelationship[]
    chainLinks: EntityChainLink[]
    similarEntities: SimilarEntity[]
  } | null
  isLoading: boolean
  error: string | null

  // SECTION COLLAPSE STATE
  expandedSections: Set<string>

  // ACTIONS
  loadEntity: (name: string) => Promise<void>
  toggleSection: (section: string) => void
}
```

### Store Design Rules

1. **No cross-store imports.** Stores do not import each other. Pages compose data from multiple stores.
2. **Each store owns its data.** No shared state between stores.
3. **Component 02 stores are read-only.** Frontend reads from Graph Studio stores but never writes to them.
4. **Loading/error per store.** Each store manages its own loading and error state.
5. **Filters live in the store that owns the data.** Directory filters in directory-store, collection filters in collection-store.

---

## 17. Type Definitions

### New Types (Component 03)

```typescript
// types/frontend.ts

// ── Route Types ────────────────────────────────────────────────
type Route =
  | { page: 'home' }
  | { page: 'directory'; name: string }
  | { page: 'collection'; name: string }
  | { page: 'project'; uniqueId: string }
  | { page: 'entity'; name: string }
  | { page: 'graph'; collectionName: string }
  | { page: 'source'; htmlPath: string }   // URL-encoded in query param (slashes in path)
  | { page: 'settings' }

interface BreadcrumbSegment {
  label: string
  route: Route | null
}

// ── Home Screen ────────────────────────────────────────────────
interface DirectorySummary {
  name: string
  description: string | null
  projectCount: number
  collectionCount: number
  entityCount: number
}

interface CollectionListItem {
  name: string
  projectCount: number
}

// ── Directory View ─────────────────────────────────────────────
interface DirectoryCollection {
  name: string
  projectCount: number
  entityCount: number
  allTags: string[]
  topEntities: Array<{ name: string; pageRank: number }>
}

interface DirectoryProject {
  name: string
  uniqueId: string
  tags: string[]
  htmlPath: string
  domain: string
  subdomain: string
  collections: string[]
  entityCount: number
  createdDate: string | null
}

interface DirectoryEntity {
  name: string
  category: string
  pageRank: number
  betweenness: number
  projectCount: number
  bridgeTier: 'gold' | 'silver' | 'bronze' | 'none'
  dirProjectCount: number
  collectionNames: string[]
}

// ── Collection View ────────────────────────────────────────────
interface CollectionProject {
  name: string
  uniqueId: string
  tags: string[]
  htmlPath: string
  domain: string
  subdomain: string
  entityCount: number
  createdDate: string | null
}

interface BridgeEntityItem {
  name: string
  category: string
  pageRank: number
  betweenness: number
  projectCount: number
  tier: 'gold' | 'silver'
}

interface TopEntityItem {
  name: string
  category: string
  pageRank: number
}

interface CategoryCount {
  category: string
  count: number
}

interface CausalChainItem {
  chainId: string
  chainName: string
  chainDescription: string
  projectName: string
  projectId: string
  links: Array<{
    source: string
    target: string
    orderIndex: number
    explanation: string
  }>
}

interface ProjectRecommendation {
  name: string
  uniqueId: string
  domain: string
  subdomain: string
  sharedEntityNames: string[]
  sharedCount: number
}

// ── Project View ───────────────────────────────────────────────
interface ProjectEntity {
  name: string
  category: string
  pageRank: number
  projectCount: number
  role: string
  bridgeTier: 'gold' | 'silver' | 'bronze' | 'none'
}

interface ProjectRelationship {
  source: string
  target: string
  relType: string
  causalClassification: string
  description: string
  evidence: string
  evidenceStrength: string
  magnitude: string
  year: number | null
}

interface TimelineEvent {
  phaseIndex: number
  label: string
  period: string | null
  entities: string[]
}

interface RelatedProject {
  name: string
  uniqueId: string
  domain: string
  sharedNames: string[]
  sharedCount: number
}

// ── Entity View ────────────────────────────────────────────────
interface EntityProjectMention {
  project: string
  uniqueId: string
  role: string
  htmlPath: string
  directory: string
  domain: string
}

interface EntityRelationship {
  entity: string
  relType: string
  causalClassification: string
  description: string
  magnitude: string
  evidenceStrength: string
  year: number | null
}

interface EntityChainLink {
  chainId: string
  chainName: string
  entity: string
  orderIndex: number
  explanation: string
}

interface SimilarEntity {
  name: string
  category: string
  similarity: number
}
```

### Reused Types (from Component 02)

The following types from `02-graph-studio/src/types/graph.ts` are imported directly:
- `GraphNode`, `GraphLink` (for Graph Studio store reads)
- `CollectionInfo` (for collection listing)
- `BridgeEntity` (structural reference)

---

## 18. Component Library

Reusable UI components built for the Frontend. Design system components that enforce visual consistency.

### DataTable

Generic sortable, filterable table component.

```typescript
interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  search?: { value: string; onChange: (v: string) => void; placeholder: string }
  filters?: FilterDef[]
  sort?: { by: string; dir: 'asc' | 'desc'; onChange: (by: string, dir: string) => void }
  emptyMessage?: string
  onRowClick?: (item: T) => void
}

interface ColumnDef<T> {
  key: string
  header: string
  width?: string
  sortable?: boolean
  render: (item: T) => React.ReactNode
}

interface FilterDef {
  label: string
  items: string[]
  onAdd: (item: string) => void
  onRemove: (item: string) => void
  onClear: () => void
}
```

### InfoCard

Collapsible card for detail views (Project View, Entity View).

```typescript
interface InfoCardProps {
  title: string
  count?: number
  defaultExpanded?: boolean
  expanded?: boolean
  onToggle?: () => void
  children: React.ReactNode
}
```

Styling: `var(--surface)` background, `var(--border)` border, 12px padding. Header: uppercase label in `var(--text-muted)`, count badge in `var(--surface-hover)`.

### StatsGrid

Horizontal stat bar (used in Collection View, Project View).

```typescript
interface StatsGridProps {
  stats: Array<{ label: string; value: number | string }>
}
```

### MetricBar

Horizontal progress bar for GDS metrics (reused from Component 02 concept).

```typescript
interface MetricBarProps {
  label: string
  value: number              // 0-10 scale
  textLabel: string          // "Low" | "Medium" | "High" | "Very High"
  tooltip?: string
}
```

### CategoryBadge

Color dot + category name. Same as Component 02 but available as standalone.

```typescript
interface CategoryBadgeProps {
  category: string
  size?: 'sm' | 'md'
}
```

### BridgeBadge

Gold/Silver/Bronze tier indicator.

```typescript
interface BridgeBadgeProps {
  tier: 'gold' | 'silver' | 'bronze' | 'none'
}
```

### PillList

The universal pill display component (Section 14).

```typescript
interface PillListProps {
  items: string[]
  maxVisible?: number
  variant: 'tag' | 'entity' | 'category' | 'collection'
  onItemClick?: (item: string) => void
  onFilterAdd?: (item: string) => void
}
```

### EditableText

Inline editable text field for directory/collection descriptions.

```typescript
interface EditableTextProps {
  value: string
  placeholder?: string
  multiline?: boolean
  onSave: (newValue: string) => void
}
```

### ConfirmDialog

Modal confirmation for destructive actions.

```typescript
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}
```

### AddProjectModal

Full modal for adding projects to a collection (Section 7.3).

```typescript
interface AddProjectModalProps {
  open: boolean
  collectionName: string
  onClose: () => void
  onAdd: (uniqueId: string) => void
}
```

### TopNav

The persistent top navigation bar (Section 4).

### CollapsibleSection

Generic section with expand/collapse toggle. Used in all detail views.

```typescript
interface CollapsibleSectionProps {
  title: string
  count?: number
  defaultExpanded?: boolean
  children: React.ReactNode
}
```

### ErrorBoundary

Catches render errors, shows fallback UI.

```typescript
interface ErrorBoundaryProps {
  fallback?: React.ReactNode
  children: React.ReactNode
}
```

### CausalChainView

Renders a causal chain as an ordered entity → entity flow.

```typescript
interface CausalChainViewProps {
  chain: CausalChainItem
  onEntityClick: (name: string) => void
  onProjectClick: (uniqueId: string) => void
}
```

---

## 19. Color System & Design Tokens

The Frontend inherits ALL CSS custom properties from Component 02's `globals.css`. No new colors are introduced — visual consistency is maintained by sharing the same design tokens.

### Inherited from Component 02

```css
/* Base Palette */
--bg: #0a0a0f;
--surface: #141420;
--surface-hover: #1a1a2e;
--surface-raised: #181824;
--border: #2a2a3e;
--border-subtle: #1e1e30;

/* Text */
--text-primary: #e4e4e7;
--text-secondary: #a1a1aa;
--text-muted: #71717a;

/* Accents */
--accent: #60A5FA;
--accent-dim: rgba(96, 165, 250, 0.08);
--warning: #FBBF24;
--error: #EF4444;
--success: #4ADE80;

/* Radii */
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
```

### 14 Category Colors (same as Component 02)

```
Person:       #4ADE80     Organization: #60A5FA     Place:        #9CA3AF
Event:        #F87171     Concept:      #A78BFA     System:       #FB923C
Process:      #2DD4BF     Technology:   #38BDF8     Law:          #FBBF24
Agreement:    #E879F9     Metric:       #F59E0B     Document:     #94A3B8
Resource:     #34D399     Other:        #6B7280
```

### Bridge Tier Colors (same as Component 02)

```
Gold:   #FFD700
Silver: #C0C0C0
Bronze: #CD7F32
```

### Evidence Strength Colors (same as Component 02)

```
established: #22C55E
claimed:     #60A5FA
disputed:    #F59E0B
speculative: #9CA3AF
```

### New Design Patterns (Frontend-specific)

| Pattern | Usage | Styling |
|---------|-------|---------|
| **Page header** | Directory name, Collection name at top of page | 20px font, `var(--text-primary)`, 24px margin-bottom |
| **Section header** | "Projects", "Bridge Entities", etc. | 14px uppercase, `var(--text-muted)`, `letter-spacing: 0.05em` |
| **Stats number** | "287" in stats bar | 24px font, `var(--text-primary)`, `font-variant-numeric: tabular-nums` |
| **Stats label** | "Entities" below number | 11px, `var(--text-muted)` |
| **Table row** | Data table rows | `var(--surface)` default, `var(--surface-hover)` on hover, `var(--border-subtle)` bottom border |
| **Table header** | Column headers | 11px uppercase, `var(--text-muted)`, `letter-spacing: 0.05em`, `var(--surface)` background |
| **Action button (primary)** | "Open Graph Studio" | `var(--accent)` background, white text, `var(--radius-md)`, 32px height |
| **Action button (secondary)** | "Export Collection" | `var(--surface-hover)` background, `var(--text-secondary)` text, `var(--border)` border |
| **Action button (danger)** | "Delete Directory" | `var(--error)` at 15% opacity background, `var(--error)` text |
| **Orphan badge** | "No collection" | `var(--warning)` at 15% opacity background, `var(--warning)` text, pill shape |

---

## 20. File Structure

```
components/03-frontend/
├── DESIGN-SPEC.md                     ← THIS FILE (read-only reference)
├── STATUS.md                          ← NOT STARTED → CLOSED when done
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── .env                               ← NEO4J connection (gitignored)
├── src/
│   ├── main.tsx                       ← ReactDOM.createRoot
│   ├── App.tsx                        ← TopNav + Router + Page content
│   │
│   ├── types/
│   │   └── frontend.ts               ← All Frontend-specific types (Section 17)
│   │
│   ├── adapters/                      ← ALL Component 02 imports go through here
│   │   ├── graph-studio.tsx           ← <GraphStudioAdapter> wrapping C02 App.tsx
│   │   ├── neo4j-service.ts           ← Re-exports getSession(), closeDriver()
│   │   ├── source-paths.ts            ← Re-exports resolveSourceUrl()
│   │   └── graph-stores.ts            ← Re-exports useGraphStore, useSelectionStore (read-only)
│   │
│   ├── services/
│   │   └── frontend-queries.ts       ← All Q-F queries (Section 15)
│   │                                    Imports from adapters/neo4j-service.ts
│   │
│   ├── stores/
│   │   ├── navigation-store.ts       ← Route, breadcrumbs, history
│   │   ├── directory-store.ts        ← Directories, directory detail, filters
│   │   ├── collection-store.ts       ← Collection detail, membership, recommendations
│   │   ├── project-store.ts          ← Project detail, section collapse state
│   │   └── entity-store.ts           ← Entity profile, section collapse state
│   │
│   ├── router/
│   │   └── Router.tsx                ← Simple hash/history router (~50 lines)
│   │
│   ├── pages/
│   │   ├── HomePage.tsx              ← Directory grid + Graph Studio quick-launch
│   │   ├── DirectoryPage.tsx         ← Tabbed view (Collections | Projects | Entities)
│   │   ├── CollectionPage.tsx        ← Full collection console
│   │   ├── ProjectPage.tsx           ← Info card stack (8 sections)
│   │   ├── EntityPage.tsx            ← Cross-document profile (6 sections)
│   │   ├── GraphPage.tsx             ← Embeds Component 02 App.tsx
│   │   ├── SourcePage.tsx            ← HTML document viewer
│   │   └── SettingsPage.tsx          ← Neo4j config + about
│   │
│   ├── components/
│   │   ├── TopNav.tsx                ← Persistent top navigation + breadcrumbs
│   │   ├── DataTable.tsx             ← Generic sortable/filterable table
│   │   ├── InfoCard.tsx              ← Collapsible section card
│   │   ├── StatsGrid.tsx             ← Horizontal stat bar
│   │   ├── MetricBar.tsx             ← Horizontal progress bar (GDS metrics)
│   │   ├── PillList.tsx              ← Universal pill display (4 + N more)
│   │   ├── EditableText.tsx          ← Inline editable text field
│   │   ├── ConfirmDialog.tsx         ← Modal confirmation
│   │   ├── AddProjectModal.tsx       ← Add project to collection modal
│   │   ├── CausalChainView.tsx       ← Chain entity → entity flow
│   │   ├── CollapsibleSection.tsx    ← Generic expand/collapse wrapper
│   │   ├── ErrorBoundary.tsx         ← Render error catcher
│   │   │
│   │   └── shared/
│   │       ├── CategoryBadge.tsx     ← Color dot + category name
│   │       ├── BridgeBadge.tsx       ← Gold/Silver/Bronze badge
│   │       └── OrphanBadge.tsx       ← Amber "No collection" badge
│   │
│   ├── constants/
│   │   └── colors.ts                 ← CATEGORY_COLORS, BRIDGE_COLORS (imported from C02 or duplicated)
│   │
│   └── styles/
│       └── globals.css               ← Imports C02 globals.css + Frontend-specific additions
│
└── contracts/
    └── electron-contract.md          ← What Component 05 expects from Frontend
```

### Dependency on Component 02 (via Adapter Layer)

**Rule: No page, store, or component imports from `02-graph-studio/` directly. All cross-component access goes through `src/adapters/`.**

The adapter files import from Component 02:
- `adapters/neo4j-service.ts` ← `02-graph-studio/src/services/neo4j.ts` (shared driver singleton)
- `adapters/graph-studio.tsx` ← `02-graph-studio/src/App.tsx` (embedded graph view)
- `adapters/graph-stores.ts` ← `02-graph-studio/src/stores/graph-store.ts`, `selection-store.ts` (read-only)
- `adapters/source-paths.ts` ← `02-graph-studio/src/utils/paths.ts` (`resolveSourceUrl()`)
- `styles/globals.css` ← `02-graph-studio/src/styles/globals.css` (CSS custom properties — imported in stylesheet, not through adapter)

These imports use relative paths. In Component 05 (Electron), these will be unified into a single build. The adapter layer is the seam where Electron can add IPC or error boundaries.

---

## 21. Build Phases

### Phase 1: Scaffold + Router + TopNav (1 session)
- Vite + React + TypeScript project setup
- Package.json with dependencies (react, react-dom, zustand, tailwindcss, neo4j-driver)
- Import globals.css from Component 02 (or copy with reference)
- Import neo4j.ts from Component 02 (shared driver)
- Simple hash-based Router.tsx
- navigation-store.ts with route and breadcrumbs
- TopNav.tsx with logo, breadcrumbs, settings icon
- App.tsx shell: TopNav + Router
- Empty page stubs for all 8 routes
- **Test:** Navigate between pages via URL hash. Breadcrumbs update correctly.

### Phase 2: Home Screen + Directory CRUD (1 session)
- directory-store.ts — loadDirectories, createDirectory, updateDirectory, deleteDirectory
- frontend-queries.ts — Q-F1, Q-F19, Q-F20, Q-F21, Q-F29
- HomePage.tsx — directory card grid, Graph Studio quick-launch bar
- DirectoryCard component with edit/delete inline controls
- EditableText.tsx component
- ConfirmDialog.tsx component
- **Test:** Home screen shows directories with stats. Create directory → appears. Edit description → saves. Delete empty directory → removes. Graph Studio dropdown lists collections.

### Phase 3: Directory View — Tabbed Console (1 session)
- frontend-queries.ts — Q-F2, Q-F3, Q-F4, Q-F5, Q-F6
- directory-store.ts — loadDirectoryDetail, tab filters, tab sorts
- DirectoryPage.tsx — tab bar + 3 tab panels
- DataTable.tsx — generic table component
- PillList.tsx — universal pill display (4 + N more pattern)
- CategoryBadge.tsx, BridgeBadge.tsx, OrphanBadge.tsx
- Collections tab: table with cross-entity search (3 modes)
- Projects tab: table with filters, orphan indicator
- Entities tab: table with category/bridge/collection filters
- **Test:** All 3 tabs render data. Search across entities works. Filters chain correctly. Pill overflow shows popover. Sort toggles work.

### Phase 4: Collection View (1 session)
- frontend-queries.ts — Q-F7, Q-F8, Q-F9, Q-F10, Q-F16, Q-F17, Q-F18, Q-F22, Q-F24, Q-F25, Q-F26
- collection-store.ts — full implementation
- CollectionPage.tsx — full console layout
- StatsGrid.tsx component
- AddProjectModal.tsx — with GDS recommendations
- Collection header with editable description
- Projects section with search/filter/sort, add/remove buttons
- Bridge entities section (grouped by tier)
- Top entities section (ranked list)
- Category breakdown section (bar chart)
- Causal chains section (collapsible)
- **Test:** Collection loads with all sections. Add project (from recommendation) → appears. Remove project → warning if last collection. Description edits save to Neo4j.

### Phase 5: Project View + Entity View (1 session)
- frontend-queries.ts — Q-F11, Q-F12, Q-F13, Q-F14, Q-F15, Q-F27, Q-F28
- project-store.ts — full implementation
- entity-store.ts — full implementation
- ProjectPage.tsx — 8 collapsible sections
- EntityPage.tsx — 6 collapsible sections
- InfoCard.tsx, CollapsibleSection.tsx
- MetricBar.tsx component
- CausalChainView.tsx component
- **Test:** Project view shows all 8 sections with correct data. Entity view shows cross-document profile. All entity/project/collection names are clickable links.

### Phase 6: Graph Studio Integration + Source Viewer (1 session)
- Modify Component 02 App.tsx: add optional `initialCollection` prop
- GraphPage.tsx — embeds Component 02 with collection context
- SourcePage.tsx — iframe/div HTML viewer with dark theme
- Settings page — Neo4j connection config + test
- **Test:** Click "Open Graph Studio" in collection → graph loads with correct collection. Source viewer shows formatted HTML. Settings test connection works.

### Phase 7: Polish + Cross-Navigation + Close (1 session)
- Full cross-navigation audit (every name must be a link — Section 13)
- Error states for all pages (loading, error, empty)
- Empty states: "No directories", "No collections", "No projects in this collection"
- Edge cases: orphan projects, empty directories, collections with 1 project
- Export collection button (spawn export_collection.py)
- Performance check: all pages load in <1 second
- Write STATUS.md → CLOSED
- Write interface contract for Component 04 (MCP)
- Write interface contract for Component 05 (Electron)
- **Test:** Full walkthrough of every user journey. Every link navigates correctly. No dead ends.

---

## 22. Decisions Log (Component 03)

| # | Decision | Rationale |
|---|----------|-----------|
| D41 | Graph Studio receives optional `initialCollection` prop | Only modification to Component 02. Bypasses collection picker when embedded. |
| D42 | Simple hash-based router, no React Router | 8 routes don't need a library. ~50 lines of code. |
| D43 | Shared Neo4j driver with Component 02 | frontend-contract.md explicitly says "Do NOT create a second driver instance." |
| D44 | 5 new Zustand stores + 3 imported read-only | Clean separation. No cross-store imports. Each page composes from stores it needs. |
| D45 | Collection.description as new Neo4j property | Neo4j is property-flexible. Adding description doesn't affect Component 01 (upload.py doesn't touch it) or Component 02 (doesn't query it). |
| D46 | DirectoryCategory.description already exists | Bootstrap creates DirectoryCategory with name and description. We can write to it. |
| D47 | Manual descriptions only (no auto-generation in C03) | Component 01 is locked. Auto-generation deferred to Component 04 (MCP tool). |
| D48 | Directory delete only if empty (zero IN_DIRECTORY) | Prevents orphaning projects. Guard in Cypher query. |
| D49 | Orphan projects get amber badge in Directory View | Projects removed from last collection stay visible via IN_DIRECTORY. Amber badge signals "no collection" status. |
| D50 | Cross-entity search in Collections tab (3 modes) | Search by collection name, by project name within collection, by entity name within collection. Most powerful discovery mechanism. |
| D51 | Add Project modal with GDS-based recommendations | Shared entity count between candidate and collection. Natural discovery mechanism. |
| D52 | Remove Project shows warning if last collection | User must know the consequence. Orphan projects lose graph view access. |
| D53 | Pill display: 4 visible + N more overflow | Prevents table rows from growing unbounded. Universal pattern across all lists. |
| D54 | Filter state NOT preserved across page navigation | Too complex for v1. Users re-apply filters on each page visit. |
| D55 | No external routing library | Hash-based router is sufficient. No SSR needed (Electron app). |
| D56 | Source viewer uses iframe with dark theme injection | Cleanest separation of generated HTML from app styles. |
| D57 | Category breakdown as horizontal bars | Simple, glanceable. No pie charts (hard to read for 14 categories). |
| D58 | Entity View is global (not directory-scoped) | Entities span directories. Breadcrumb shows "Entity: Name" without directory context. |
| D59 | First 2 "Mentioned In" projects expanded by default | Entity View shows role text immediately for the most relevant projects. Rest collapsed. |
| D60 | Create Collection available (not just manage existing) | Users may want to create empty collections and then add projects. |

---

## 23. Definition of Done

Component 03 is CLOSED when ALL of these pass:

### Navigation
- [ ] All 8 routes work (home, directory, collection, project, entity, graph, source, settings)
- [ ] Breadcrumbs show correct path and are clickable
- [ ] Browser back/forward works
- [ ] TopNav logo navigates to home
- [ ] Settings icon navigates to settings

### Home Screen
- [ ] Directory cards show with name, description, stats
- [ ] Create directory works (name + description)
- [ ] Edit directory description works
- [ ] Delete directory works (only if empty, disabled otherwise)
- [ ] Graph Studio quick-launch dropdown lists all collections
- [ ] Clicking dropdown option navigates to Graph Studio

### Directory View
- [ ] 3 tabs work (Collections, Projects, Entities)
- [ ] Collections tab: table with all columns, sorted, filterable
- [ ] Collections tab: cross-entity search (by name, by project, by entity)
- [ ] Projects tab: table with all columns, orphan badge for collection-less projects
- [ ] Entities tab: table with category badges, bridge badges, influence bars
- [ ] All tab filters work (entity, tag, category, bridge, collection)
- [ ] Pill display shows 4 + N more with popover
- [ ] Sort toggles on all sortable columns

### Collection View
- [ ] Header shows name + editable description
- [ ] Stats bar shows 6 metrics
- [ ] Projects section: list with search/filter/sort
- [ ] Add Project modal: recommendations (sorted by shared entity count) + all available
- [ ] Remove Project: confirmation, warning if last collection
- [ ] Bridge entities: grouped by tier (Gold, Silver), clickable names
- [ ] Top entities: ranked list, top 10 by pageRank
- [ ] Category breakdown: horizontal bar per category
- [ ] Causal chains: collapsible list with entity → entity links
- [ ] Open Graph Studio button navigates to graph view
- [ ] Export button triggers export flow

### Project View
- [ ] Header shows name, directory, domain, tags, collections, date
- [ ] 8 collapsible sections work
- [ ] Summary: full text, no truncation
- [ ] Entities: table sorted by pageRank, clickable names
- [ ] Relationships: expandable rows with description + evidence
- [ ] Causal chains: collapsible with entity links
- [ ] Narrative flow: ordered list
- [ ] Timeline: ordered events with linked entities
- [ ] Related projects: by shared entity count
- [ ] View Source Document button works

### Entity View
- [ ] Header: category dot, name, aliases, definition
- [ ] Metrics: 4 bars (Influence, Bridge Score, Connections, Cross-Document)
- [ ] Mentioned In: per-project roles (first 2 expanded)
- [ ] Relationships: all RELATES_TO, expandable rows
- [ ] Chain participation: causal chains involving this entity
- [ ] Similar entities: from SIMILAR_TO
- [ ] Collections: list of collections containing this entity

### Graph Studio Integration
- [ ] Graph Studio loads with correct collection when navigated from collection view
- [ ] Collection picker is bypassed (initialCollection prop)
- [ ] Shared Neo4j driver (single connection)
- [ ] Back navigation via breadcrumb works

### Source Viewer
- [ ] HTML renders in dark theme
- [ ] Scrollable full document
- [ ] Back navigation works

### Settings
- [ ] Neo4j connection fields editable
- [ ] Test connection works (shows entity count or error)
- [ ] Settings persist (localStorage)

### Cross-Navigation
- [ ] Every entity name in the entire UI is a clickable link → /entity/:name
- [ ] Every project name is a clickable link → /project/:uniqueId
- [ ] Every collection name is a clickable link → /collection/:name
- [ ] Every directory name is a clickable link → /directory/:name
- [ ] Every source icon (📄) navigates to source viewer
- [ ] No dead ends — user can always navigate back via breadcrumb

### Visual Consistency
- [ ] Dark theme consistent with Component 02 (same CSS custom properties)
- [ ] Near-black background (#0a0a0f)
- [ ] All category colors match Component 02
- [ ] All bridge tier colors match Component 02
- [ ] No raw GDS property names visible (human-readable labels only)
- [ ] Pill display consistent across all tables and cards

### Data Integrity
- [ ] All data from Neo4j (no hardcoded test data)
- [ ] Neo4j writes (descriptions, collection membership) work correctly
- [ ] Deleting empty directory works; non-empty prevented
- [ ] Adding/removing projects updates collection stats
- [ ] Orphan projects correctly identified and badged
- [ ] Database name is 'memorytonic' (not 'neo4j')
- [ ] Embeddings NOT loaded (excluded from all queries)

### Documentation
- [ ] STATUS.md → CLOSED
- [ ] Interface contract for Component 04 (MCP) written
- [ ] Interface contract for Component 05 (Electron) written
- [ ] Any new decisions logged in memory/decisions.md

---

## 24. Traps

Inherited from Components 01/02 + new Frontend traps:

| # | Trap | Consequence | Prevention |
|---|------|------------|------------|
| T1 | Database name is `memorytonic`, not `neo4j` | Silent wrong-database errors, empty results | Always specify `{ database: 'memorytonic' }` in driver session |
| T6 | Neo4j Integer types | Neo4j returns Integer objects, not JS numbers | Use `.toNumber()` in all transforms |
| T8 | Embedding arrays in entity nodes | 384 floats per entity = wasted bandwidth | EXCLUDE embedding from all Cypher RETURN clauses |
| T13 | Shared Neo4j driver | Creating a second driver instance = connection leak | Import from Component 02's neo4j.ts, never create new driver |
| T14 | Collection.description is a NEW property | Queries may return `null` for collections created before Component 03 | Always handle `null` descriptions gracefully (show placeholder or edit prompt) |
| T15 | DirectoryCategory deletion guard | Deleting a directory with projects orphans them | Cypher WHERE NOT EXISTS guard prevents delete. UI disables button. |
| T16 | Project ← Collection is many-to-many | A project can be in multiple collections | Always use DISTINCT when counting collections per project |
| T17 | Entity names are the primary key for Entity View | Entity names must be unique (enforced by Component 01's uniqueness constraint) | Use entity name as route param, not entityId |
| T18 | Cross-entity search returns duplicates | Same collection can match in all 3 search modes | Deduplicate by collection name before displaying |
| T19 | baseTags is an array property in Neo4j | Need to flatten when aggregating across projects | Use `reduce()` in Cypher or post-process in JS |
| T20 | Orphan detection is real-time | Project might become orphan during session | Re-check on collection view load, not cached |
| T21 | Graph Studio's App.tsx currently requires no props | Adding initialCollection prop must be backward-compatible | Use optional parameter with default null (falls back to picker) |
| T22 | Windows path separators in htmlPath | htmlPath uses forward slashes but Windows might break | resolveSourceUrl() handles this — always use it, never construct paths manually |
| T23 | Neo4j write operations need explicit transactions | Writes can partially fail | Use `session.executeWrite()` for all mutations |
| T24 | Pill overflow popover positioning | Popover may overflow viewport on small screens | Position relative to pill, clamp to viewport boundaries |
| T25 | htmlPath contains slashes | Route segment `:htmlPath` breaks with `data/sources/2026-04-06/proj/01_html.html` | Use query param `?path=encodeURIComponent(htmlPath)`, decode on parse |

---

## 25. Integration Verification Checklist

Before each build phase, verify these integration points:

### Data Layer Checks
- [ ] Neo4j driver imported from Component 02 (not a new instance)
- [ ] Database is 'memorytonic' in all sessions
- [ ] All Q-F queries return data for test dataset (7 projects, 287 entities)
- [ ] All Neo4j Integer values converted to JS numbers
- [ ] Embeddings excluded from all queries
- [ ] Null handling for new properties (Collection.description)

### Component 02 Integration Checks
- [ ] Graph Studio App.tsx accepts optional initialCollection prop
- [ ] CSS custom properties shared (same globals.css)
- [ ] resolveSourceUrl() works for source viewer
- [ ] Component 02 stores readable from Frontend (graph-store, selection-store)
- [ ] No writes to Component 02 stores from Frontend

### Navigation Checks
- [ ] All 8 routes resolve correctly
- [ ] Breadcrumbs build correctly from route + context
- [ ] Browser back/forward works with hash-based routing
- [ ] Every entity/project/collection/directory name links to correct page
- [ ] No circular navigation (clicking a link on a page never navigates to the same page)

### Mutation Checks
- [ ] Create directory → node appears in Neo4j → home screen refreshes
- [ ] Update directory description → property updated in Neo4j
- [ ] Delete directory → only works if empty → node removed from Neo4j
- [ ] Update collection description → property set in Neo4j
- [ ] Add project to collection → BELONGS_TO relationship created
- [ ] Remove project from collection → BELONGS_TO relationship deleted
- [ ] Warning shown when removing last collection from project

### Cross-Navigation Audit
- [ ] Home Screen: directory names link to /directory
- [ ] Directory View: collection names link to /collection, project names to /project, entity names to /entity
- [ ] Collection View: project names to /project, entity names to /entity, chain entities to /entity
- [ ] Project View: entity names to /entity, collection names to /collection, related projects to /project
- [ ] Entity View: project names to /project, related entities to /entity, collection names to /collection
- [ ] Source icons (📄) navigate to /source everywhere they appear
- [ ] Graph Studio button navigates to /graph from home and collection pages

### End-to-End Flow Checks
- [ ] Home → Directory → Collection → Graph Studio (full journey)
- [ ] Home → Directory → Entity → Project → Source (full journey)
- [ ] Collection → Add Project → recommendation click → project appears
- [ ] Collection → Remove Project → orphan warning → project removed
- [ ] Directory → Create → Edit description → Delete empty (full CRUD)
- [ ] Entity → Mentioned In → Project → Related Project → Entity (cross-nav loop)

---

## Neo4j Schema Additions

Component 03 adds the following properties to the Neo4j schema. These are **property additions only** — no new constraints, no new node types, no new relationship types.

### New Properties

| Node | Property | Type | Written By | Read By |
|------|----------|------|-----------|---------|
| `Collection` | `description` | string \| null | Component 03 (Q-F22) | Component 03 (Q-F7) |

### Existing Properties Used

| Node | Property | Notes |
|------|----------|-------|
| `DirectoryCategory` | `description` | Already exists from bootstrap. Component 03 reads and writes it. |

### Schema Safety

- **No constraint changes.** Component 01's 7 constraints remain untouched.
- **No index changes.** Component 01's 17 indexes remain untouched.
- **Property additions are safe.** Neo4j is schema-flexible. Adding `description` to Collection nodes doesn't affect Component 01 (upload.py writes `collectionId`, `name`, `createdAt` — ignores unknown properties) or Component 02 (queries don't reference `description`).

---

*End of Design Specification. This document is the single source of truth for Component 03 implementation.*
*Design session 2026-04-07.*
