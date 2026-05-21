/**
 * Color System — Complete mapping
 *
 * Source of truth: DESIGN-SPEC.md Section 16
 * Every color in the application lives here.
 */

// ── 14 Entity Category Colors (dark theme, vibrant on dark bg) ──

export const CATEGORY_COLORS: Record<string, string> = {
  Person:       '#4ADE80',  // green
  Organization: '#60A5FA',  // blue
  Place:        '#9CA3AF',  // grey
  Event:        '#F87171',  // red
  Concept:      '#A78BFA',  // purple
  System:       '#FB923C',  // orange
  Process:      '#2DD4BF',  // teal
  Technology:   '#38BDF8',  // sky
  Law:          '#FBBF24',  // amber
  Agreement:    '#E879F9',  // fuchsia
  Metric:       '#F59E0B',  // yellow
  Document:     '#94A3B8',  // slate
  Resource:     '#34D399',  // emerald
  Other:        '#6B7280',  // neutral
}

// ── 15 Causal Classification Edge Colors ────────────────────────

export const CAUSAL_COLORS: Record<string, string> = {
  CAUSES:          '#EF4444',  // red
  ENABLES:         '#22C55E',  // green
  BLOCKS:          '#F97316',  // orange
  INFLUENCES:      '#8B5CF6',  // violet
  DEPENDS_ON:      '#3B82F6',  // blue
  CONTRADICTS:     '#DC2626',  // dark red
  SUPPORTS:        '#16A34A',  // dark green
  PRECEDES:        '#A3A3A3',  // grey
  COMPETES_WITH:   '#F59E0B',  // amber
  COOPERATES_WITH: '#06B6D4',  // cyan
  REGULATES:       '#D946EF',  // fuchsia
  TRANSFORMS:      '#EC4899',  // pink
  PRODUCES:        '#84CC16',  // lime
  CONSUMES:        '#78716C',  // stone
  IMPLEMENTS:      '#0EA5E9',  // light blue
}

// ── Structural Edge Colors (non-causal) ─────────────────────────

export const MENTIONED_IN_COLOR = '#71717a'  // zinc-500, neutral membership edge

// ── Bridge Tier Colors ──────────────────────────────────────────

export const BRIDGE_COLORS: Record<string, string> = {
  gold:   '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  none:   'transparent',
}

// ── Evidence Strength Colors ────────────────────────────────────

export const EVIDENCE_COLORS: Record<string, string> = {
  established: '#4ADE80',  // green — solid
  claimed:     '#FBBF24',  // amber — caution
  disputed:    '#F87171',  // red — contested
  speculative: '#A78BFA',  // purple — uncertain
}

// ── UI Theme ────────────────────────────────────────────────────

export const THEME = {
  bg:            '#0a0a0f',
  surface:       '#141420',
  surfaceHover:  '#1a1a2e',
  border:        '#2a2a3e',
  textPrimary:   '#e4e4e7',
  textSecondary: '#a1a1aa',
  textMuted:     '#71717a',
  accent:        '#60A5FA',
  warning:       '#FBBF24',
  error:         '#EF4444',
} as const

// ── Project node color (not a category, structural) ─────────────

export const PROJECT_NODE_COLOR = '#a1a1aa'  // zinc-400, neutral
