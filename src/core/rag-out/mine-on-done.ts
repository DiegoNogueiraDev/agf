/*!
 * RAG-OUT goal mining wired into agf done (Task node_27840fae2453).
 *
 * WHY: `mineScaffoldCandidates` existed but was never invoked automatically.
 * This module closes the loop: when agf done completes, recurring task-title
 * patterns are mined and persisted to workflow-graph/memories/scaffold-candidates.json
 * so they can later be promoted into the scaffold corpus — no manual agf dream needed.
 *
 * Composes with: rag-out/mining.ts (algorithm), done-cmd.ts (call site, finally block).
 * Contract: never throws — all errors are caught and swallowed so done always completes.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { mineScaffoldCandidates, type ScaffoldCandidate } from './mining.js'
import type { Language } from './language.js'

const EXT_LANG: Readonly<Record<string, Language>> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.swift': 'swift',
  '.php': 'php',
  '.dart': 'dart',
  '.fs': 'fsharp',
  '.fsi': 'fsharp',
  '.fsx': 'fsharp',
}

/**
 * Infer the dominant language from a list of artifact file paths.
 * Returns 'unknown' when the list is empty or no extension is recognised.
 */
export function inferLanguageFromFiles(filePaths: string[]): Language {
  const freq = new Map<Language, number>()
  for (const p of filePaths) {
    const lang = EXT_LANG[extname(p).toLowerCase()]
    if (lang) freq.set(lang, (freq.get(lang) ?? 0) + 1)
  }
  if (freq.size === 0) return 'unknown'
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

const CANDIDATES_REL_PATH = join('workflow-graph', 'memories', 'scaffold-candidates.json')

/**
 * Mine scaffold candidates from RAG-OUT goals and persist results.
 * Returns the newly found candidates (may be empty). Never throws.
 */
export function mineAndPersistScaffoldCandidates(goals: readonly string[], projectDir: string): ScaffoldCandidate[] {
  try {
    const candidates = mineScaffoldCandidates(goals)
    if (candidates.length === 0) return []

    const candidatesPath = join(projectDir, CANDIDATES_REL_PATH)
    const memDir = join(projectDir, 'workflow-graph', 'memories')
    mkdirSync(memDir, { recursive: true })

    let existing: ScaffoldCandidate[] = []
    if (existsSync(candidatesPath)) {
      try {
        existing = JSON.parse(readFileSync(candidatesPath, 'utf-8')) as ScaffoldCandidate[]
      } catch {
        existing = []
      }
    }

    const merged = mergeByKey([...existing, ...candidates])
    writeFileSync(candidatesPath, JSON.stringify(merged, null, 2), 'utf-8')
    return candidates
  } catch {
    return []
  }
}

function mergeByKey(candidates: ScaffoldCandidate[]): ScaffoldCandidate[] {
  const seen = new Map<string, ScaffoldCandidate>()
  for (const c of candidates) {
    const prev = seen.get(c.suggestedId)
    if (prev) {
      seen.set(c.suggestedId, {
        ...c,
        count: prev.count + c.count,
        examples: [...new Set([...prev.examples, ...c.examples])].slice(0, 5),
      })
    } else {
      seen.set(c.suggestedId, c)
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------------------
// Artifact descriptor loop — closes production-consumption gap
// ---------------------------------------------------------------------------

/** A lightweight descriptor derived from a done artifact — stored and retrieved. */
export interface ArtifactDescriptor {
  /** Normalised goal string from the task title. */
  goal: string
  /** Stable key derived from the goal (kebab-case slug). */
  id: string
  /** Artifact file paths contributed by this task. */
  files: string[]
  /** Inferred dominant language. */
  language: Language
  /** ISO timestamp of last update. */
  updatedAt: string
}

const ARTIFACT_DESCRIPTORS_PATH = join('workflow-graph', 'memories', 'artifact-descriptors.json')

function goalToId(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/**
 * Mine an artifact descriptor from the done task and persist it.
 * Idempotent: same goal → merged entry. Never throws.
 */
export function mineArtifactDescriptor(
  filePaths: string[],
  goal: string,
  projectDir: string,
): ArtifactDescriptor | null {
  try {
    const language = inferLanguageFromFiles(filePaths)
    const id = goalToId(goal)
    const descriptor: ArtifactDescriptor = {
      goal,
      id,
      files: filePaths,
      language,
      updatedAt: new Date().toISOString(),
    }

    const descPath = join(projectDir, ARTIFACT_DESCRIPTORS_PATH)
    const memDir = join(projectDir, 'workflow-graph', 'memories')
    mkdirSync(memDir, { recursive: true })

    let existing: ArtifactDescriptor[] = []
    if (existsSync(descPath)) {
      try {
        existing = JSON.parse(readFileSync(descPath, 'utf-8')) as ArtifactDescriptor[]
      } catch {
        existing = []
      }
    }

    const map = new Map<string, ArtifactDescriptor>()
    for (const d of existing) map.set(d.id, d)
    const prev = map.get(id)
    map.set(id, {
      ...descriptor,
      files: prev ? [...new Set([...prev.files, ...filePaths])] : filePaths,
    })

    writeFileSync(descPath, JSON.stringify([...map.values()], null, 2), 'utf-8')
    return descriptor
  } catch {
    return null
  }
}

/**
 * Load all artifact descriptors mined from previous `agf done` calls.
 * Returns [] when the file does not exist. Never throws.
 */
export function loadMinedDescriptors(projectDir: string): ArtifactDescriptor[] {
  try {
    const descPath = join(projectDir, ARTIFACT_DESCRIPTORS_PATH)
    if (!existsSync(descPath)) return []
    return JSON.parse(readFileSync(descPath, 'utf-8')) as ArtifactDescriptor[]
  } catch {
    return []
  }
}
