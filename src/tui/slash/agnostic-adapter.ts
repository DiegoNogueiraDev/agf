import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/slash/agnostic-adapter.ts' })

// ── Types ──────────────────────────────────────────────────

export interface SkillInfo {
  name: string
  desc: string
  category: string
}

export interface SkillContent {
  name: string
  body: string
}

export interface GraphJsonDoc {
  projectName?: string
  phase?: string
  nodes: Array<{
    id: string
    type: string
    title: string
    status: string
    priority?: number
  }>
  edges?: Array<unknown>
}

// ── Adapter Interface ───────────────────────────────────────

export interface SlashCommandAdapter {
  readonly isReadOnly: boolean
  findNext(): { id: string; title: string; reason: string } | { blocked: true } | null
  stats(): { totalNodes: number; byStatus: Record<string, number> }
  getPhase(): string
  listSkills(phase?: string): SkillInfo[]
  getSkill(name: string): SkillContent | undefined
}

// ── FileSystemAdapter ───────────────────────────────────────

const SKILLS_BASE = '.agents/skills'
const GRAPH_JSON = 'graph.json'

export class FileSystemAdapter implements SlashCommandAdapter {
  readonly isReadOnly = true
  private readonly baseDir: string
  private cachedJson: GraphJsonDoc | null = null

  constructor(baseDir: string) {
    log.debug(`FileSystemAdapter: ${baseDir}`)
    this.baseDir = baseDir
  }

  private loadGraphJson(): GraphJsonDoc {
    if (this.cachedJson) return this.cachedJson
    const path = join(this.baseDir, GRAPH_JSON)
    if (!existsSync(path)) {
      this.cachedJson = { nodes: [] }
      return this.cachedJson
    }
    const raw = readFileSync(path, 'utf-8')
    this.cachedJson = JSON.parse(raw) as GraphJsonDoc
    return this.cachedJson
  }

  reload(): void {
    this.cachedJson = null
  }

  findNext(): { id: string; title: string; reason: string } | { blocked: true } | null {
    const doc = this.loadGraphJson()
    const first = doc.nodes.find((n) => n.status !== 'done')
    if (!first) return null
    return { id: first.id, title: first.title, reason: `status=${first.status}` }
  }

  stats(): { totalNodes: number; byStatus: Record<string, number> } {
    const doc = this.loadGraphJson()
    const byStatus: Record<string, number> = {}
    for (const n of doc.nodes) {
      byStatus[n.status] = (byStatus[n.status] || 0) + 1
    }
    return { totalNodes: doc.nodes.length, byStatus }
  }

  getPhase(): string {
    const doc = this.loadGraphJson()
    return doc.phase ?? 'IMPLEMENT'
  }

  listSkills(_phase?: string): SkillInfo[] {
    const skillsDir = join(this.baseDir, SKILLS_BASE)
    if (!existsSync(skillsDir)) return []

    const entries = readdirSync(skillsDir, { withFileTypes: true })
    const results: SkillInfo[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillDirPath = join(skillsDir, entry.name)
      const skillMdPath = join(skillDirPath, 'SKILL.md')
      if (!existsSync(skillMdPath)) continue

      const content = readFileSync(skillMdPath, 'utf-8')
      const name = entry.name
      const desc = parseDescription(content)
      const category = parseCategory(content) || 'cross-cutting'
      results.push({ name, desc, category })
    }

    return results.sort((a, b) => a.name.localeCompare(b.name))
  }

  getSkill(name: string): SkillContent | undefined {
    const skillDirPath = join(this.baseDir, SKILLS_BASE, name)
    const skillMdPath = join(skillDirPath, 'SKILL.md')
    if (!existsSync(skillMdPath)) return undefined

    const body = readFileSync(skillMdPath, 'utf-8')
    return { name, body }
  }
}

// ── StoreAdapter ────────────────────────────────────────────

export interface CommandPortLike {
  findNext(): { id: string; title: string; reason: string } | { blocked: true } | null
  stats(): { totalNodes: number; byStatus: Record<string, number> }
  getPhase(): string
  listSkills(phase?: string): SkillInfo[]
  getSkill(name: string): SkillContent | undefined
}

export class StoreAdapter implements SlashCommandAdapter {
  readonly isReadOnly = false
  private readonly port: CommandPortLike

  constructor(port: CommandPortLike) {
    this.port = port
  }

  findNext(): { id: string; title: string; reason: string } | { blocked: true } | null {
    return this.port.findNext()
  }

  stats(): { totalNodes: number; byStatus: Record<string, number> } {
    return this.port.stats()
  }

  getPhase(): string {
    return this.port.getPhase()
  }

  listSkills(phase?: string): SkillInfo[] {
    return this.port.listSkills(phase)
  }

  getSkill(name: string): SkillContent | undefined {
    return this.port.getSkill(name)
  }
}

// ── Helpers ─────────────────────────────────────────────────

function parseDescription(content: string): string {
  const match = content.match(/description:\s*(.+)/)
  return match ? match[1].trim() : ''
}

function parseCategory(content: string): string {
  const match = content.match(/category:\s*(.+)/)
  return match ? match[1].trim() : 'cross-cutting'
}
