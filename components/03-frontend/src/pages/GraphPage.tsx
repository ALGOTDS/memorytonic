/**
 * GraphPage — Embeds Component 02 Graph Studio via adapter.
 * Source of truth: DESIGN-SPEC.md Section 10
 */
import GraphStudioAdapter from '../adapters/graph-studio'
import { useNavigationStore } from '../stores/navigation-store'

export default function GraphPage({ collectionName }: { collectionName: string }) {
  const navigate = useNavigationStore(s => s.navigate)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 48px)', // Full height minus TopNav
      overflow: 'hidden',
    }}>
      {/* Thin toolbar */}
      <div className="flex items-center justify-between" style={{
        padding: '6px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div className="flex items-center gap-3">
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Collection:</span>
          <span
            className="data-link"
            style={{ fontSize: '13px' }}
            onClick={() => navigate({ page: 'collection', name: collectionName })}
          >
            {collectionName}
          </span>
        </div>
        <button
          className="btn btn-secondary"
          style={{ padding: '2px 10px', fontSize: '12px' }}
          onClick={() => navigate({ page: 'collection', name: collectionName })}
        >
          Back to Collection
        </button>
      </div>

      {/* Graph Studio embed — fills remaining space */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <GraphStudioAdapter collectionName={collectionName} />
      </div>
    </div>
  )
}
