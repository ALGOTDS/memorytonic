/**
 * LSB Section 4: Project Filter
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (Section 4), Section 8
 * Checkbox per project. Bridge entities stay if ANY checked project contains them.
 */

import { useGraphStore } from '../../stores/graph-store'
import CollapsibleSection from '../shared/CollapsibleSection'

export default function ProjectFilter() {
  const projects = useGraphStore(s => s.projects)
  const projectFilter = useGraphStore(s => s.projectFilter)
  const toggleProject = useGraphStore(s => s.toggleProject)
  const selectAll = useGraphStore(s => s.selectAllProjects)
  const deselectAll = useGraphStore(s => s.deselectAllProjects)

  const allSelected = projects.length > 0 && projects.every(p => projectFilter.has(p.uniqueId))

  return (
    <CollapsibleSection title="Projects" count={projects.length} id="lsb-projects">
      {/* Bulk toggle */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={allSelected ? deselectAll : selectAll}
          className="text-xs"
          style={{ color: 'var(--accent)' }}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="space-y-1">
        {projects.map(p => (
          <label key={p.uniqueId} className="flex items-center gap-2 cursor-pointer py-0.5">
            <input
              type="checkbox"
              checked={projectFilter.has(p.uniqueId)}
              onChange={() => toggleProject(p.uniqueId)}
              className="accent-blue-500"
            />
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {p.name}
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  )
}
