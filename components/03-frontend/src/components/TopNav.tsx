/**
 * TopNav — persistent navigation bar across all pages.
 * Source of truth: DESIGN-SPEC.md Section 4
 * 48px height, logo left, breadcrumbs center, Graph Studio + settings right.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigationStore } from '../stores/navigation-store'
import { useDirectoryStore } from '../stores/directory-store'

export default function TopNav() {
  const breadcrumbs = useNavigationStore(s => s.breadcrumbs)
  const navigate = useNavigationStore(s => s.navigate)
  const route = useNavigationStore(s => s.route)
  const allCollections = useDirectoryStore(s => s.allCollections)
  const loadAllCollections = useDirectoryStore(s => s.loadAllCollections)

  const [gsOpen, setGsOpen] = useState(false)
  const [gsCollection, setGsCollection] = useState('')
  const gsRef = useRef<HTMLDivElement>(null)

  // Load collections lazily when dropdown opens
  useEffect(() => {
    if (gsOpen && allCollections.length === 0) {
      loadAllCollections()
    }
  }, [gsOpen, allCollections.length, loadAllCollections])

  // Close dropdown on outside click
  useEffect(() => {
    if (!gsOpen) return
    const handler = (e: MouseEvent) => {
      if (gsRef.current && !gsRef.current.contains(e.target as Node)) {
        setGsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [gsOpen])

  // Already on graph page?
  const onGraphPage = route.page === 'graph'

  return (
    <div className="top-nav">
      {/* Logo — click → home */}
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => navigate({ page: 'home' })}
        style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '14px' }}
      >
        <span style={{ fontSize: '16px' }}>◆</span>
        <span>MemoryTonic</span>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center flex-1 ml-4">
        {breadcrumbs.map((seg, i) => (
          <span key={i} className="flex items-center">
            {i > 0 && <span className="breadcrumb-separator">›</span>}
            {seg.route ? (
              <span
                className="breadcrumb-segment"
                onClick={() => navigate(seg.route!)}
              >
                {seg.label}
              </span>
            ) : (
              <span className="breadcrumb-current">{seg.label}</span>
            )}
          </span>
        ))}
      </div>

      {/* Graph Studio launcher — right side */}
      <div ref={gsRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setGsOpen(!gsOpen)}
          title="Graph Studio"
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '5px', border: '1px solid',
            cursor: 'pointer', fontSize: '12px', fontWeight: 500,
            transition: 'all 0.15s',
            background: onGraphPage ? 'rgba(99,102,241,0.15)' : 'transparent',
            borderColor: onGraphPage ? 'rgba(99,102,241,0.3)' : 'var(--border-subtle)',
            color: onGraphPage ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          <span style={{ fontSize: '13px' }}>🔬</span>
          <span>Graph Studio</span>
        </button>

        {/* Dropdown panel */}
        {gsOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '6px',
            width: '280px', padding: '10px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 100,
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Launch Graph Studio
            </div>
            <select
              className="input"
              style={{ width: '100%', marginBottom: '8px', fontSize: '12px' }}
              value={gsCollection}
              onChange={e => setGsCollection(e.target.value)}
            >
              <option value="">Select Collection...</option>
              {allCollections.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.projectCount} projects)
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              style={{ width: '100%', fontSize: '12px', padding: '6px' }}
              disabled={!gsCollection}
              onClick={() => {
                navigate({ page: 'graph', collectionName: gsCollection })
                setGsOpen(false)
                setGsCollection('')
              }}
            >
              Launch
            </button>
          </div>
        )}
      </div>

      {/* Settings icon — right side */}
      <div
        className="cursor-pointer"
        style={{ color: 'var(--text-muted)', fontSize: '16px' }}
        onClick={() => navigate({ page: 'settings' })}
        title="Settings"
      >
        ⚙
      </div>
    </div>
  )
}
