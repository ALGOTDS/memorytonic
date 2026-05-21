/**
 * Left Sidebar — All controls in one scrollable panel
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (full LSB layout)
 * 280px fixed width. Sections 2 (Search), 8 (Path), 9 (Saved Views), 10 (Export) added later.
 */

import CollectionHeader from './CollectionHeader'
import SearchBar from './SearchBar'
import ImportanceSlider from './ImportanceSlider'
import ProjectFilter from './ProjectFilter'
import CategoryFilter from './CategoryFilter'
import BridgeFilter from './BridgeFilter'
import EdgeTypeFilter from './EdgeTypeFilter'
import PathFinder from './PathFinder'
import SavedViews from './SavedViews'
import ExportButton from './ExportButton'

export default function LeftSidebar() {
  return (
    <div
      className="h-full overflow-y-auto flex-shrink-0"
      style={{
        width: 280,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Section 1: Collection Header (always visible) */}
      <CollectionHeader />

      {/* Section 2: Search */}
      <SearchBar />

      {/* Section 3: Importance Bandwidth */}
      <ImportanceSlider />

      {/* Section 4: Project Filter */}
      <ProjectFilter />

      {/* Section 5: Category Filter */}
      <CategoryFilter />

      {/* Section 6: Bridge Filter */}
      <BridgeFilter />

      {/* Section 7: Edge Type Filter */}
      <EdgeTypeFilter />

      {/* Section 8: Path Finder */}
      <PathFinder />

      {/* Section 9: Quick Views */}
      <SavedViews />

      {/* Section 10: Export */}
      <ExportButton />
    </div>
  )
}
