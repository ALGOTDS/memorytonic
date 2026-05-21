/**
 * Read-only access to Component 02 stores.
 * Used for breadcrumb context when Graph Studio is active.
 * NEVER write to these stores from Component 03.
 */
export { useGraphStore } from '../../../02-graph-studio/src/stores/graph-store'
export { useSelectionStore } from '../../../02-graph-studio/src/stores/selection-store'
