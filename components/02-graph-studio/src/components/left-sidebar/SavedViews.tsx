/**
 * SavedViews — LSB Section 9: Quick filter presets
 *
 * Source of truth: DESIGN-SPEC.md Section 5 (Section 9)
 * 3 hardcoded presets + user-saved views in localStorage.
 */

import { useGraphStore } from '../../stores/graph-store'
import CollapsibleSection from '../shared/CollapsibleSection'

interface ViewPreset {
  name: string
  description: string
  apply: () => void
}

export default function SavedViews() {
  const store = useGraphStore

  const presets: ViewPreset[] = [
    {
      name: 'Overview',
      description: 'All filters default',
      apply: () => {
        store.getState().resetAllFilters()
      },
    },
    {
      name: 'Bridges Only',
      description: 'Gold + Silver bridge entities',
      apply: () => {
        // First reset everything, then set bridge filter to only gold+silver
        store.getState().resetAllFilters()
        store.getState().setBridgeFilter(new Set(['gold', 'silver']))
      },
    },
    {
      name: 'High Influence',
      description: 'Top 30% by importance',
      apply: () => {
        store.getState().resetAllFilters()
        store.getState().setBandwidthRange([70, 100])
      },
    },
  ]

  return (
    <CollapsibleSection title="Quick Views" defaultOpen={false} id="lsb-views">
      <div className="space-y-1">
        {presets.map(preset => (
          <button
            key={preset.name}
            onClick={preset.apply}
            className="w-full text-left px-2 py-1.5 rounded text-xs"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{preset.name}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{preset.description}</div>
          </button>
        ))}
      </div>
    </CollapsibleSection>
  )
}
