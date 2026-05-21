/**
 * Home Screen — Directory Grid + Graph Studio Quick-Launch
 * Source of truth: DESIGN-SPEC.md Section 5
 */
import { useEffect, useState } from 'react'
import { useDirectoryStore } from '../stores/directory-store'
import { useNavigationStore } from '../stores/navigation-store'
import { createCollection } from '../services/frontend-queries'
import ConfirmDialog from '../components/ConfirmDialog'
import EditableText from '../components/EditableText'

export default function HomePage() {
  const { directories, allCollections, isLoading, error, loadDirectories, loadAllCollections,
    createDirectory, updateDirectory, deleteDirectory } = useDirectoryStore()
  const navigate = useNavigationStore(s => s.navigate)

  const [selectedCollection, setSelectedCollection] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [newDirDesc, setNewDirDesc] = useState('')
  const [editingDir, setEditingDir] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showCollectionForm, setShowCollectionForm] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [newColDesc, setNewColDesc] = useState('')

  useEffect(() => {
    loadDirectories()
    loadAllCollections()
  }, [loadDirectories, loadAllCollections])

  const handleCreate = async () => {
    if (!newDirName.trim()) return
    await createDirectory(newDirName.trim(), newDirDesc.trim())
    setNewDirName('')
    setNewDirDesc('')
    setShowCreateForm(false)
  }

  const handleUpdate = async (oldName: string) => {
    if (!editName.trim()) return
    await updateDirectory(oldName, editName.trim(), editDesc.trim())
    setEditingDir(null)
  }

  const handleCreateCollection = async () => {
    if (!newColName.trim()) return
    await createCollection(newColName.trim(), newColDesc.trim())
    setNewColName('')
    setNewColDesc('')
    setShowCollectionForm(false)
    await loadAllCollections()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const deleted = await deleteDirectory(deleteTarget)
    if (!deleted) {
      setDeleteError(`Cannot delete "${deleteTarget}" — it still has projects.`)
    }
    setDeleteTarget(null)
  }

  if (isLoading && directories.length === 0) {
    return <div className="loading-state">Loading directories...</div>
  }
  if (error) {
    return (
      <div className="error-state">
        Error: {error}
        <button className="btn btn-secondary" style={{ marginLeft: '12px' }}
          onClick={() => { loadDirectories(); loadAllCollections() }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* Graph Studio Quick-Launch Bar */}
      <div className="card-accent flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '18px' }}>🔬</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Open Graph Studio</span>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="input"
            style={{ width: '280px' }}
            value={selectedCollection}
            onChange={e => setSelectedCollection(e.target.value)}
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
            disabled={!selectedCollection}
            onClick={() => navigate({ page: 'graph', collectionName: selectedCollection })}
          >
            Launch
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowCollectionForm(true)}
          >
            + New Collection
          </button>
        </div>
      </div>

      {/* Create Collection Form */}
      {showCollectionForm && (
        <div className="card mb-4" style={{ maxWidth: '400px' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px' }}>
            New Collection
          </h3>
          <div className="flex flex-col gap-3">
            <input
              className="input"
              placeholder="Collection name"
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateCollection()}
              autoFocus
            />
            <textarea
              className="input"
              placeholder="Description (optional)"
              value={newColDesc}
              onChange={e => setNewColDesc(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => setShowCollectionForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateCollection} disabled={!newColName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600 }}>
          Your Directories
        </h2>
        <button className="btn btn-secondary" onClick={() => setShowCreateForm(true)}>
          + New Directory
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="card mb-4" style={{ maxWidth: '400px' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px' }}>
            New Directory
          </h3>
          <div className="flex flex-col gap-3">
            <input
              className="input"
              placeholder="Directory name"
              value={newDirName}
              onChange={e => setNewDirName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <textarea
              className="input"
              placeholder="Description (optional)"
              value={newDirDesc}
              onChange={e => setNewDirDesc(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!newDirName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Error Toast */}
      {deleteError && (
        <div
          className="card mb-4"
          style={{ borderColor: 'var(--error)', background: 'rgba(239,68,68,0.08)', maxWidth: '500px' }}
        >
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--error)' }}>{deleteError}</span>
            <button
              className="btn btn-secondary"
              style={{ padding: '2px 8px', fontSize: '12px' }}
              onClick={() => setDeleteError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Directory Grid */}
      {directories.length === 0 ? (
        <div className="empty-state">No directories yet. Create your first directory.</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {directories.map(dir => (
            <div key={dir.name} className="directory-card">
              {/* Top section */}
              <div>
                {editingDir === dir.name ? (
                  /* Edit mode */
                  <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      className="input"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleUpdate(dir.name)}
                      autoFocus
                    />
                    <textarea
                      className="input"
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2 justify-end">
                      <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '12px' }}
                        onClick={() => setEditingDir(null)}>Cancel</button>
                      <button className="btn btn-primary" style={{ padding: '2px 8px', fontSize: '12px' }}
                        onClick={() => handleUpdate(dir.name)}>Save</button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div onClick={() => navigate({ page: 'directory', name: dir.name })}>
                    <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                      {dir.name}
                    </h3>
                    <EditableText
                      value={dir.description}
                      placeholder="No description"
                      onSave={(desc) => updateDirectory(dir.name, dir.name, desc)}
                    />
                  </div>
                )}
              </div>

              {/* Stats */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.8 }}>
                  <div>{dir.collectionCount} collections</div>
                  <div>{dir.projectCount} projects</div>
                  <div>{dir.entityCount} entities</div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-3" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '2px 10px', fontSize: '12px' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingDir(dir.name)
                      setEditName(dir.name)
                      setEditDesc(dir.description || '')
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: '2px 10px', fontSize: '12px' }}
                    disabled={dir.projectCount > 0}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(dir.name)
                    }}
                    title={dir.projectCount > 0 ? 'Cannot delete — has projects' : 'Delete directory'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Directory"
        message={`Are you sure you want to delete "${deleteTarget}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
