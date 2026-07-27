/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Doc-sync hook — wires the (previously dormant) doc-sync-guard drift detector
 * into the `task:post-complete` channel. `detectDocDrift` shipped with a test
 * but no caller; its header promised a "hook task:post-complete" that never
 * existed. This module is that caller.
 *
 * Store-free by design: the shared HookBus registers built-in handlers WITHOUT
 * a store, so we read doc files from the filesystem (relative to cwd) and use
 * the graph.db mtime as a cheap proxy for "latest node activity" that
 * detectDocDrift needs. Baselines persist as JSON next to the graph. Everything
 * is best-effort — a doc-sync failure must never break task completion.
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, type Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { detectDocDrift, hashDocContent, isDocSyncDisabled, type DocBaseline } from './doc-sync-guard.js'

/** Baseline store filename, co-located with the graph under workflow-graph/. */
export const DOC_BASELINE_FILE = 'doc-baselines.json'

/** Roots scanned for doc drift, mirroring the doc-sync-guard header. */
const DOC_ROOTS = ['CLAUDE.md', '.claude/rules', 'docs'] as const

/** Bound the scan so task completion stays cheap on large docs/ trees. */
const MAX_DOC_FILES = 400

/** A single drift advisory surfaced to the caller (logged, never thrown). */
export interface DocSyncAdvisory {
  /** Project-relative doc path. */
  path: string
  reason: 'stale_doc'
  ageDays: number
}

export interface DocSyncReport {
  /** True when opted out via MCP_GRAPH_DOC_SYNC=off. */
  disabled: boolean
  /** Number of doc files inspected. */
  checked: number
  /** Stale-doc advisories to surface. */
  advisories: DocSyncAdvisory[]
  /** How many baselines were created/refreshed this run. */
  baselinesWritten: number
}

interface BaselineMap {
  [path: string]: DocBaseline
}

/** Recursively collect `.md` files under a directory, bounded by MAX_DOC_FILES. */
function collectMarkdown(root: string, acc: string[]): void {
  if (acc.length >= MAX_DOC_FILES) return
  let entries: Dirent[]
  try {
    entries = readdirSync(root, { withFileTypes: true }) as Dirent[]
  } catch {
    return
  }
  for (const entry of entries) {
    if (acc.length >= MAX_DOC_FILES) return
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      collectMarkdown(full, acc)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      acc.push(full)
    }
  }
}

/** Resolve the doc files to inspect, deterministically sorted. */
function collectDocFiles(cwd: string): string[] {
  const found: string[] = []
  for (const root of DOC_ROOTS) {
    const abs = join(cwd, root)
    if (!existsSync(abs)) continue
    if (statSync(abs).isDirectory()) {
      collectMarkdown(abs, found)
    } else if (abs.endsWith('.md')) {
      found.push(abs)
    }
  }
  return [...new Set(found)].sort()
}

function loadBaselines(path: string): BaselineMap {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as BaselineMap
  } catch {
    return {}
  }
}

/** graph.db mtime as a proxy for the most recent node activity. */
function latestNodeActivityMs(cwd: string): number {
  try {
    return statSync(join(cwd, 'workflow-graph', 'graph.db')).mtimeMs
  } catch {
    return 0
  }
}

/**
 * Inspect doc files for drift and refresh baselines. Pure of side effects
 * beyond reading docs and writing the baseline JSON; returns a structured
 * report the hook layer logs as an advisory.
 */
export function checkDocSync(opts: { cwd: string; env?: NodeJS.ProcessEnv; nowMs?: number }): DocSyncReport {
  const env = opts.env ?? process.env
  if (isDocSyncDisabled(env)) {
    return { disabled: true, checked: 0, advisories: [], baselinesWritten: 0 }
  }

  const now = opts.nowMs ?? Date.now()
  const graphDir = join(opts.cwd, 'workflow-graph')
  const baselinePath = join(graphDir, DOC_BASELINE_FILE)
  const baselines = loadBaselines(baselinePath)
  const latestNodeUpdateMs = latestNodeActivityMs(opts.cwd)

  const advisories: DocSyncAdvisory[] = []
  let checked = 0
  let dirty = 0

  for (const file of collectDocFiles(opts.cwd)) {
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    checked++
    const rel = relative(opts.cwd, file).split(sep).join('/')
    const result = detectDocDrift({
      path: rel,
      currentContent: content,
      baseline: baselines[rel],
      latestNodeUpdateMs,
      nowMs: now,
    })

    if (result.reason === 'no_baseline' || result.reason === 'content_changed') {
      baselines[rel] = { path: rel, hash: hashDocContent(content), recordedAt: now }
      dirty++
    } else if (result.drift) {
      advisories.push({ path: rel, reason: 'stale_doc', ageDays: result.ageDays })
    }
  }

  if (dirty > 0 && existsSync(graphDir)) {
    try {
      writeFileSync(baselinePath, JSON.stringify(baselines, null, 2))
    } catch {
      // best-effort — a read-only FS must not break task completion
    }
  }

  return { disabled: false, checked, advisories, baselinesWritten: dirty }
}
