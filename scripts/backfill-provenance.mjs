import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = __dirname + '/../workflow-graph/graph.db'

if (!existsSync(DB_PATH)) {
  console.error('DB not found at', DB_PATH)
  process.exit(1)
}

function inferSourceFile(type, title) {
  const map = {
    epic: 'AGENTS.md',
    task: 'AGENTS.md',
    subtask: 'AGENTS.md',
    requirement: 'PRD.md',
    constraint: 'PRD.md',
    milestone: 'PRD.md',
    risk: 'PRD.md',
    decision: 'docs/architecture/decisions/',
    interface: 'docs/architecture/interfaces/',
    acceptance_criteria: 'AGENTS.md',
  }
  return map[type] || 'UNKNOWN'
}

const db = new Database(DB_PATH)
const rows = db.prepare('SELECT id, type, title, metadata FROM nodes').all()

let updated = 0
let skipped = 0

for (const row of rows) {
  let md = null
  try {
    md = row.metadata ? JSON.parse(row.metadata) : {}
  } catch {
    md = {}
  }

  if (md.provenance?.source_file) {
    skipped++
    continue
  }

  const sourceFile = inferSourceFile(row.type, row.title)

  if (!md.provenance) {
    md.provenance = {}
  }
  md.provenance.source_file = sourceFile
  md.provenance.source = md.provenance.source || 'backfill'
  md.provenance.ts = md.provenance.ts || new Date().toISOString()

  db.prepare('UPDATE nodes SET metadata = ? WHERE id = ?').run(JSON.stringify(md), row.id)
  updated++
}

console.log(`Updated: ${updated}, Skipped: ${skipped}, Total: ${rows.length}`)
db.close()
