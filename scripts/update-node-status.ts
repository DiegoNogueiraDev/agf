import { SqliteStore } from '../src/core/store/sqlite-store.js'

const s = SqliteStore.open(process.cwd())
const project = s.getProject()
if (!project) {
  console.error('No project found')
  process.exit(1)
}
const pid = project.id
const db = s.getDb()

const doneIds = [
  'm2-t1-kanban-board',
  'm2-t2-diff-preview',
  'm2-t3-harness-widget',
  'm2-t4-phase-indicator',
  'm2-t5-skill-progress',
  'm2-t6-token-budget',
  'm2-t7-reuse-suggestions',
  'm1-t1-skill-registry',
  'm1-t2-handler-port',
  'm1-t3-map-handlers',
  'm1-t4-execution-context',
  'm1-t5-lifecycle-gate',
  'm3-t1-build-e2e',
  'm3-t2-preset-apply',
  'm3-t3-scaffold',
  'm3-t4-constitution',
  'm3-t5-agf-wizard',
  'm3-t6-feedback-loop',
]

// Also mark epics, risks, constraints, ADRs and interface contracts as done
const supportIds = [
  'epic-slash-commands',
  'epic-m2-tui-visualizacao',
  'epic-m1-core-engine',
  'epic-m3-orquestracao-e2e',
  'adr-001-skill-handler-port',
  'adr-002-component-tui',
  'adr-003-deterministic-first',
  'adr-004-lifecycle-pipeline',
  'adr-005-reuse-first',
  'iface-skill-handler-port',
  'iface-skill-registry',
  'iface-kanban-component',
  'iface-lifecycle-pipeline',
  'risk-regression',
  'risk-token-budget',
  'risk-ink-performance',
  'constraint-no-regression',
  'constraint-tdd-mandatory',
  'constraint-deterministic-first',
]

const now = new Date().toISOString()
for (const id of [...doneIds, ...supportIds]) {
  const r = db
    .prepare('UPDATE nodes SET status = ?, updated_at = ? WHERE id = ? AND project_id = ?')
    .run('done', now, id, pid)
  console.log(r.changes > 0 ? `  \u2713 ${id}` : `  ~ ${id} (nao encontrado)`)
}

const stats = s.getStats()
console.log(
  `\nGrafo: ${stats.totalNodes} nodes | ${Object.entries(stats.byStatus)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')}`,
)
s.close()
