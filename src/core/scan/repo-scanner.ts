/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 *
 *
 * Repo scanner — deterministic, zero-LLM fingerprint of an external root of
 * sibling repos (e.g. `..`). For each repo it derives the tech stack, reads the
 * README/manifests, tags capabilities from the lexicon, and diffs them against
 * what agf already has to emit ranked insights. No network, no model calls.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { McpGraphError } from '../utils/errors.js'
import { detectCapabilities, agfCapabilities, specForTag, type Pillar, type Level } from './capability-lexicon.js'
import { extractFeaturesWithForageStop, type CorpusDocument } from './feature-extractor.js'
import { dedupeRepoDirs, type RepoDir } from './repo-dedupe.js'

/** Read at most this many bytes of each README (keeps the scan cheap). */
const README_HEAD_BYTES = 16_384

/** Total markdown bytes read per repo for capability detection (bounded). */
const DOC_BUDGET_BYTES = 64 * 1024

/** Max number of markdown files read per repo (keeps deep repos cheap). */
const DOC_FILE_CAP = 40

/** Directories never worth descending into (heavy / generated / vendored). */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'coverage',
  '.git',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
])

/** The agf repo's own directory name — excluded by default. */
const SELF_DIR = 'agent-graph-flow'

export interface RepoFingerprint {
  name: string
  path: string
  /** Primary stack (first detected) — 'node-ts' | 'python' | 'go' | 'rust' | 'unknown'. */
  kind: string
  /** All detected stacks. */
  stack: string[]
  /** Capability tags detected in this repo. */
  capabilities: string[]
  hasGit: boolean
  readmeBytes: number
  /** ISO date of last commit, or null when no git / not requested. */
  lastCommit: string | null
  /**
   * Distinctive TF-IDF terms outside the capability lexicon (opt-in via
   * `ScanOptions.distinctiveTerms`). Undefined when the option is off, keeping
   * default output byte-identical.
   */
  distinctiveTerms?: string[]
}

export interface Insight {
  repo: string
  capability: string
  label: string
  insight: string
  pillar: Pillar
  effort: Level
  impact: Level
  presentInAgf: boolean
  /** Cites the agf module/command that delivers this capability when presentInAgf=true. */
  agfModule?: string
}

export interface ScanSummary {
  repoCount: number
  scannedCount: number
  insightCount: number
  uniqueGapCount: number
  byPillar: Record<Pillar, number>
}

export interface ScanResult {
  root: string
  repos: RepoFingerprint[]
  insights: Insight[]
  summary: ScanSummary
}

export interface ScanOptions {
  /** Directory basenames to skip. */
  exclude?: string[]
  /** Include the agf repo itself (excluded by default). */
  includeSelf?: boolean
  /** Override the self directory name to exclude. */
  selfName?: string
  /** Resolve last-commit dates via git (default false; the CLI sets true). */
  git?: boolean
  /** agf command names, to enrich the "already has" set for the gap diff. */
  commandNames?: readonly string[]
  /**
   * How deep to descend when finding repos. 1 (default) = immediate children
   * only (original behaviour). 2+ also fingerprints nested sub-projects inside
   * monorepos, naming them by their path relative to root (e.g. `ECC/agents`).
   */
  maxDepth?: number
  /**
   * Opt-in: compute per-repo distinctive TF-IDF terms (feature-extractor.ts)
   * outside the capability lexicon. Default false — byte-identical output.
   */
  distinctiveTerms?: boolean
  /**
   * Opt-in (only meaningful with `distinctiveTerms: true`): apply the
   * forage-stop MVT early-stop (forage-stop.ts) when building the TF-IDF
   * corpus, halting once marginal new-term gain drops below the environment
   * average. Default false.
   */
  forageStop?: boolean
  /** Minimum docs kept by forage-stop even if gain drops immediately. Default 1. */
  minDocs?: number
  /**
   * Opt-in: collapse near-identical monorepo subdirs (SimHash Hamming
   * distance < threshold via repo-dedupe.ts) so a monorepo with the same
   * package ported to multiple languages (e.g. `pkg/go` + `pkg/cpp`) counts
   * once instead of inflating repoCount/insights. Only meaningful alongside
   * `maxDepth > 1`. Default false — byte-identical output.
   */
  dedupe?: boolean
}

const MANIFESTS = ['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml'] as const

/** True when a directory looks like a project worth scanning. */
function isRepo(dir: string): boolean {
  if (existsSync(path.join(dir, '.git'))) return true
  if (existsSync(path.join(dir, 'README.md'))) return true
  return MANIFESTS.some((m) => existsSync(path.join(dir, m)))
}

/** Safe head-read of a file; '' when absent or unreadable. */
function readHead(file: string, maxBytes = README_HEAD_BYTES): string {
  try {
    return readFileSync(file, 'utf-8').slice(0, maxBytes)
  } catch {
    return ''
  }
}

/**
 * Gather markdown text from a repo for capability detection: README.md, any
 * top-level `*.md`, and `docs/**\/*.md` — bounded by total bytes and file count
 * so doc-rich repos stay cheap. Returns the concatenated blob and README size.
 */
function gatherDocs(dir: string): { blob: string; readmeBytes: number } {
  const parts: string[] = []
  let budget = DOC_BUDGET_BYTES
  let files = 0

  const take = (file: string): void => {
    if (budget <= 0 || files >= DOC_FILE_CAP) return
    const text = readHead(file, budget)
    if (text) {
      parts.push(text)
      budget -= Buffer.byteLength(text, 'utf-8')
      files++
    }
  }

  // README first (and record its size).
  const readme = readHead(path.join(dir, 'README.md'))
  const readmeBytes = Buffer.byteLength(readme, 'utf-8')
  if (readme) {
    parts.push(readme)
    budget -= readmeBytes
    files++
  }

  // Top-level *.md (excluding README, already read).
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md') take(path.join(dir, e.name))
    }
  } catch {
    /* unreadable dir — skip */
  }

  // docs/** markdown (bounded recursion).
  const walkDocs = (d: string, depth: number): void => {
    if (budget <= 0 || files >= DOC_FILE_CAP || depth > 4) return
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (budget <= 0 || files >= DOC_FILE_CAP) break
      const full = path.join(d, e.name)
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walkDocs(full, depth + 1)
      else if (e.isFile() && e.name.endsWith('.md')) take(full)
    }
  }
  const docsDir = path.join(dir, 'docs')
  if (existsSync(docsDir)) walkDocs(docsDir, 0)

  return { blob: parts.join('\n'), readmeBytes }
}

/** Detect the tech stack from manifest presence + package.json contents. */
function detectStack(dir: string): string[] {
  const stack: string[] = []
  const pkg = path.join(dir, 'package.json')
  if (existsSync(pkg)) {
    const raw = readHead(pkg)
    const isTs = /"typescript"\s*:/.test(raw) || existsSync(path.join(dir, 'tsconfig.json'))
    stack.push(isTs ? 'node-ts' : 'node')
  }
  if (existsSync(path.join(dir, 'pyproject.toml')) || existsSync(path.join(dir, 'requirements.txt'))) {
    stack.push('python')
  }
  if (existsSync(path.join(dir, 'go.mod'))) stack.push('go')
  if (existsSync(path.join(dir, 'Cargo.toml'))) stack.push('rust')
  return stack
}

/** Last-commit ISO date via git, or null. */
function lastCommitDate(dir: string): string | null {
  try {
    const out = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%cs'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim() || null
  } catch {
    return null
  }
}

/** Fingerprint a single repo directory. `name` may be a relative path (nested repos). Returns the doc blob too, so callers can build a TF-IDF corpus without re-reading files. */
function fingerprint(dir: string, name: string, opts: ScanOptions): { fp: RepoFingerprint; blob: string } {
  const { blob: docs, readmeBytes } = gatherDocs(dir)
  const manifestText = MANIFESTS.map((m) => `${m}\n${readHead(path.join(dir, m), 4_096)}`).join('\n')
  const blob = `${docs}\n${manifestText}`
  const stack = detectStack(dir)
  const hasGit = existsSync(path.join(dir, '.git'))
  const fp: RepoFingerprint = {
    name,
    path: dir,
    kind: stack[0] ?? 'unknown',
    stack,
    capabilities: detectCapabilities(blob),
    hasGit,
    readmeBytes,
    lastCommit: opts.git && hasGit ? lastCommitDate(dir) : null,
  }
  return { fp, blob }
}

/**
 * Returns true when `name` matches any exclude pattern.
 * Patterns may use `*` as a wildcard (glob-style substring); otherwise the
 * pattern is an exact basename match. Matching a parent prunes the subtree
 * because the caller skips descent via `continue` when this returns true.
 */
function isExcluded(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Glob: convert '*' to '.*' for a simple regex
      const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
      if (re.test(name)) return true
    } else {
      if (name === pattern) return true
    }
  }
  return false
}

/**
 * Scan subdirectories of `root` that look like repos, fingerprint each, and diff
 * capabilities against agf's own set to produce ranked insights. With
 * `maxDepth > 1`, descends into monorepos to fingerprint nested sub-projects
 * (named by their path relative to root). Throws if `root` does not exist.
 */
export function scanRepos(root: string, opts: ScanOptions = {}): ScanResult {
  const absRoot = path.resolve(root)
  if (!existsSync(absRoot) || !statSync(absRoot).isDirectory()) {
    throw new McpGraphError(`scan root not found or not a directory: ${absRoot}`)
  }
  const selfName = opts.selfName ?? SELF_DIR
  const excludePatterns = opts.exclude ?? []
  const has = agfCapabilities(opts.commandNames)
  const maxDepth = Math.max(1, opts.maxDepth ?? 1)

  let repos: RepoFingerprint[] = []
  const corpusBlobs = new Map<string, string>()
  let scannedCount = 0

  const walk = (dir: string, depth: number): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
        .map((e) => e.name)
        .sort()
    } catch {
      return
    }
    for (const name of entries) {
      if (isExcluded(name, excludePatterns)) continue
      if (depth === 1 && name === selfName && !opts.includeSelf) continue
      const child = path.join(dir, name)
      if (depth === 1) scannedCount++
      if (isRepo(child)) {
        const { fp, blob } = fingerprint(child, path.relative(absRoot, child), opts)
        repos.push(fp)
        corpusBlobs.set(fp.name, blob)
      }
      if (depth < maxDepth) walk(child, depth + 1)
    }
  }
  walk(absRoot, 1)

  if (opts.dedupe) {
    const dirs: RepoDir[] = repos.map((r) => ({ path: r.name, content: corpusBlobs.get(r.name) ?? '' }))
    const { groups } = dedupeRepoDirs(dirs)
    const canonicalPaths = new Set(groups.map((g) => g.canonical))
    repos = repos.filter((r) => canonicalPaths.has(r.name))
  }

  if (opts.distinctiveTerms) {
    const corpus: CorpusDocument[] = repos.map((r) => ({ id: r.name, text: corpusBlobs.get(r.name) ?? '' }))
    const { features } = extractFeaturesWithForageStop(corpus, {
      enableForageStop: opts.forageStop ?? false,
      minDocs: opts.minDocs,
    })
    const termsByRepo = new Map(features.map((f) => [f.docId, f.terms.map((t) => t.term)]))
    for (const r of repos) r.distinctiveTerms = termsByRepo.get(r.name) ?? []
  }

  const insights: Insight[] = []
  for (const repo of repos) {
    for (const cap of repo.capabilities) {
      if (has.has(cap)) continue
      const spec = specForTag(cap)
      if (!spec) continue
      insights.push({
        repo: repo.name,
        capability: cap,
        label: spec.label,
        insight: spec.insight,
        pillar: spec.pillar,
        effort: spec.effort,
        impact: spec.impact,
        presentInAgf: false,
      })
    }
  }

  const byPillar: Record<Pillar, number> = { 'token-cost': 0, swe: 0, speed: 0 }
  const uniqueGaps = new Set<string>()
  for (const i of insights) {
    uniqueGaps.add(i.capability)
  }
  for (const cap of uniqueGaps) {
    const spec = specForTag(cap)
    if (spec) byPillar[spec.pillar]++
  }

  return {
    root: absRoot,
    repos,
    insights,
    summary: {
      repoCount: repos.length,
      scannedCount,
      insightCount: insights.length,
      uniqueGapCount: uniqueGaps.size,
      byPillar,
    },
  }
}
