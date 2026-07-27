import type { SqliteStore } from '../store/sqlite-store.js'
import { loadSkillsFromDir } from './skill-loader.js'

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS domain_skills (
  domain      TEXT NOT NULL,
  skill_name  TEXT NOT NULL,
  pattern     TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (domain, skill_name)
)`

function ensureTable(store: SqliteStore): void {
  store.getDb().exec(CREATE_TABLE_SQL)
}

export interface DomainSkillEntry {
  domain: string
  skillName: string
  pattern: string
  updatedAt: string
}

export interface InteractionAnalysis {
  interaction: string[]
  details: Record<string, number>
}

export interface DiscoveryResult {
  workspaceSkills: string[]
  domainSkills: DomainSkillEntry[]
  interactionSignals: string[]
}

const INTERACTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'shadow-dom', regex: /<[a-z-]+-[a-z-]+[^>]*>/gi },
  { name: 'iframes', regex: /<iframe[^>]*>/gi },
  { name: 'dropdowns', regex: /<select[^>]*>/gi },
  { name: 'dialogs', regex: /alert\s*\(|confirm\s*\(|prompt\s*\(/gi },
  { name: 'uploads', regex: /<input[^>]*type\s*=\s*["']?file["']?[^>]*>/gi },
  { name: 'drag-and-drop', regex: /<div[^>]*ondrop\s*=|ondragover\s*=|data-drop[^>]*>/gi },
  { name: 'tabs', regex: /role\s*=\s*["']?tab["']?[^>]*>|class\s*=\s*["']?[^"']*tab[^"']*["']?/gi },
  { name: 'scrolling', regex: /overflow-?[xy]?\s*:\s*(auto|scroll)/gi },
  { name: 'cookies', regex: /cookie|localStorage|sessionStorage/gi },
  { name: 'cross-origin-iframes', regex: /<iframe[^>]*src\s*=\s*["']https?:\/\/(?!sameorigin)/gi },
]

/** Extract interaction signals (forms, inputs, actions) from page HTML. */
export function analyzeInteractionSignals(html: string): InteractionAnalysis {
  const interaction: string[] = []
  const details: Record<string, number> = {}

  for (const { name, regex } of INTERACTION_PATTERNS) {
    const matches = html.match(regex)
    if (matches && matches.length > 0) {
      interaction.push(name)
      details[name] = matches.length
    }
  }

  return { interaction, details }
}

const UPSERT_SQL = `INSERT INTO domain_skills (domain, skill_name, pattern, updated_at)
VALUES (?, ?, ?, datetime('now'))
ON CONFLICT(domain, skill_name) DO UPDATE SET pattern = excluded.pattern, updated_at = datetime('now')`

const SELECT_SQL = `SELECT domain, skill_name, pattern, updated_at FROM domain_skills
WHERE domain = ? AND (skill_name = ? OR ? IS NULL)`

const LIST_SQL = `SELECT domain, skill_name, pattern, updated_at FROM domain_skills
WHERE (? IS NULL OR domain = ?) ORDER BY domain, skill_name`

type DomainSkillRow = { domain: string; skill_name: string; pattern: string; updated_at: string }

/** Persist a discovered domain skill pattern to the store. */
export function storeDomainSkill(store: SqliteStore, domain: string, skillName: string, pattern: string): void {
  ensureTable(store)
  store.getDb().prepare(UPSERT_SQL).run(domain, skillName, pattern)
}

/** Retrieve a stored domain skill entry by domain and name. */
export function getDomainSkill(store: SqliteStore, domain: string, skillName: string): DomainSkillEntry | null {
  ensureTable(store)
  const row = store.getDb().prepare(SELECT_SQL).get(domain, skillName, null) as DomainSkillRow | undefined
  if (!row) return null
  return { domain: row.domain, skillName: row.skill_name, pattern: row.pattern, updatedAt: row.updated_at }
}

/** List stored domain skills, optionally filtered by domain. */
export function listDomainSkills(store: SqliteStore, domain?: string): DomainSkillEntry[] {
  ensureTable(store)
  const rows = store
    .getDb()
    .prepare(LIST_SQL)
    .all(domain || null, domain || null) as DomainSkillRow[]
  return rows.map((r) => ({ domain: r.domain, skillName: r.skill_name, pattern: r.pattern, updatedAt: r.updated_at }))
}

export interface DiscoveryEngine {
  resolve(url: string, pageHtml: string): DiscoveryResult
}

/** Construct a skill-discovery engine bound to a store and workspace. */
export function createDiscoveryEngine(store: SqliteStore, workspaceDir: string): DiscoveryEngine {
  return {
    resolve(url: string, pageHtml: string): DiscoveryResult {
      const domain = extractDomain(url)

      const ws = loadSkillsFromDir(workspaceDir)
      const workspaceSkills = ws.loaded.map((s) => s.name)

      const domainSkills = domain ? listDomainSkills(store, domain) : []

      const interaction = analyzeInteractionSignals(pageHtml)

      return {
        workspaceSkills,
        domainSkills,
        interactionSignals: interaction.interaction,
      }
    },
  }
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
