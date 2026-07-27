/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * marketplace — registry + git clone + index for the git-based marketplace (EPIC G, G1).
 *
 * WHY: foundation for `agf marketplace add/list/install`. Clones a remote git
 * source into a cache dir and indexes the installable skills/plugins it carries.
 * Cloning is injected behind GitCloner (DIP) so the core is testable with a
 * fixture cloner — no network, no real git. Indexing/installing NEVER executes
 * remote code; it only reads manifests.
 *
 * Contracts: see ./types.ts (MarketplaceSource / MarketplaceItem / MarketplaceError).
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, type Dirent } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  MarketplaceError,
  marketplaceItemSchema,
  marketplaceSourceSchema,
  type MarketplaceItem,
  type MarketplaceSource,
} from './types.js'

const execFileAsync = promisify(execFile)
const CLONE_TIMEOUT_MS = 60_000

/** Port that materialises a git source into a local directory. */
export interface GitCloner {
  clone(gitUrl: string, ref: string, destDir: string): Promise<void>
}

/** Default cloner: shallow `git clone` via execFile (no shell → injection-safe). */
export const defaultGitCloner: GitCloner = {
  async clone(gitUrl, ref, destDir) {
    const args = ['clone', '--depth', '1']
    if (ref && ref !== 'HEAD') args.push('--branch', ref)
    args.push(gitUrl, destDir)
    try {
      await execFileAsync('git', args, { timeout: CLONE_TIMEOUT_MS })
    } catch (error: unknown) {
      throw new MarketplaceError('git clone failed', {
        gitUrl,
        ref,
        cause: error instanceof Error ? error.message : String(error),
      })
    }
  },
}

export interface MarketplaceRegistryOptions {
  /** Root directory under which each source gets its own cache dir. */
  rootCacheDir: string
  /** Injectable cloner (defaults to real git). */
  cloner?: GitCloner
}

/**
 * The published skills repository, used when the caller names no source.
 *
 * WHY a built-in default: requiring a URL means only people who already know the
 * project can install its skills — the exact friction this exists to remove. It is
 * additive: a source the user registers is listed alongside it, never replaced.
 */
export const DEFAULT_SKILL_SOURCE = 'https://github.com/DiegoNogueiraDev/skills-graph.git'

/**
 * Cache root shared by every marketplace surface, relative to the project dir.
 * Single source: `skill install` and `marketplace list` must see the SAME sources,
 * otherwise a source the user added is invisible to the command that installs.
 */
export const MARKETPLACE_CACHE_DIR = '.agf-marketplace'

/** Filename holding the registered sources, so they survive between CLI invocations. */
const SOURCES_FILE = 'sources.json'

/** Registry of cloned sources and their indexed items, persisted under the cache root. */
export class MarketplaceRegistry {
  private readonly rootCacheDir: string
  private readonly cloner: GitCloner
  private readonly sources = new Map<string, MarketplaceSource>()
  private readonly itemsBySource = new Map<string, MarketplaceItem[]>()

  constructor(options: MarketplaceRegistryOptions) {
    this.rootCacheDir = options.rootCacheDir
    this.cloner = options.cloner ?? defaultGitCloner
    this.restore()
  }

  /**
   * Reload sources recorded by a previous process and re-index their clones.
   *
   * Without this the registry is per-process: `add` clones, reports success, and the
   * next command sees nothing — a source the user cannot list does not exist to them.
   * A corrupt or unreadable record yields an empty registry rather than throwing:
   * a damaged cache must not make the whole CLI unusable, and the next `add` repairs it.
   */
  private restore(): void {
    const file = path.join(this.rootCacheDir, SOURCES_FILE)
    if (!existsSync(file)) return
    let stored: unknown
    try {
      stored = JSON.parse(readFileSync(file, 'utf-8'))
    } catch {
      return
    }
    if (!Array.isArray(stored)) return
    for (const raw of stored) {
      const parsed = marketplaceSourceSchema.safeParse(raw)
      if (!parsed.success || !existsSync(parsed.data.cacheDir)) continue
      this.sources.set(parsed.data.id, parsed.data)
      try {
        this.itemsBySource.set(parsed.data.id, indexSource(parsed.data))
      } catch {
        this.itemsBySource.set(parsed.data.id, [])
      }
    }
  }

  /** Persist the current sources so the next invocation can see them. */
  private persist(): void {
    mkdirSync(this.rootCacheDir, { recursive: true })
    writeFileSync(
      path.join(this.rootCacheDir, SOURCES_FILE),
      JSON.stringify([...this.sources.values()], null, 2),
      'utf-8',
    )
  }

  /** Clone a git url and index its installable items. */
  async addSource(
    gitUrl: string,
    options: { id?: string; ref?: string } = {},
  ): Promise<{ source: MarketplaceSource; items: MarketplaceItem[] }> {
    const url = gitUrl.trim()
    if (!isValidGitUrl(url)) {
      throw new MarketplaceError('malformed git url', { gitUrl })
    }

    const id = options.id?.trim() || deriveSourceId(url)
    const cacheDir = path.join(this.rootCacheDir, id)
    const source = marketplaceSourceSchema.parse({
      id,
      gitUrl: url,
      ref: options.ref ?? 'HEAD',
      cacheDir,
    })

    mkdirSync(this.rootCacheDir, { recursive: true })
    // Clear only THIS source's clone — git refuses a populated target, so without
    // it every run after the first fails with a clone error instead of the real
    // result. Never the cache ROOT: that holds sources.json, and wiping it would
    // silently unregister every source the user added.
    rmSync(source.cacheDir, { recursive: true, force: true })
    await this.cloner.clone(source.gitUrl, source.ref, source.cacheDir)
    const items = indexSource(source)

    this.sources.set(source.id, source)
    this.itemsBySource.set(source.id, items)
    this.persist()
    return { source, items }
  }

  /** All registered sources. */
  list(): MarketplaceSource[] {
    return [...this.sources.values()]
  }

  /** Indexed items for one source (empty if unknown). */
  getItems(sourceId: string): MarketplaceItem[] {
    return this.itemsBySource.get(sourceId) ?? []
  }
}

/** Accept http(s)/git/ssh urls and file:// or absolute local paths. */
function isValidGitUrl(url: string): boolean {
  if (!url) return false
  if (/^(https?|git|ssh|file):\/\//i.test(url)) return true
  if (/^git@[^:]+:.+/.test(url)) return true
  return path.isAbsolute(url)
}

/** Stable, filesystem-safe id from a git url (last path segment, no .git). */
function deriveSourceId(url: string): string {
  const cleaned = url.replace(/\.git$/i, '').replace(/\/+$/, '')
  const segment =
    cleaned
      .split(/[\\/:]/)
      .filter(Boolean)
      .pop() ?? 'source'
  return segment.replace(/[^a-zA-Z0-9._-]/g, '-') || 'source'
}

/** Walk a cloned source for SKILL.md (skill) and plugin.json (plugin) manifests. */
function indexSource(source: MarketplaceSource): MarketplaceItem[] {
  if (!existsSync(source.cacheDir)) {
    throw new MarketplaceError('cache dir missing after clone', { cacheDir: source.cacheDir })
  }

  const items: MarketplaceItem[] = []
  for (const manifestPath of findManifests(source.cacheDir)) {
    const base = path.basename(manifestPath)
    const dir = path.dirname(manifestPath)
    const itemId = path.basename(dir)
    if (base === 'SKILL.md') {
      items.push(
        marketplaceItemSchema.parse({
          id: itemId,
          kind: 'skill',
          sourceId: source.id,
          manifestPath,
          version: '0.0.0',
        }),
      )
    } else if (base === 'plugin.json') {
      items.push(
        marketplaceItemSchema.parse({
          id: itemId,
          kind: 'plugin',
          sourceId: source.id,
          manifestPath,
          version: readPluginVersion(manifestPath),
        }),
      )
    }
  }
  return items
}

const SKIP_DIRS = new Set(['.git', 'node_modules'])

/** Depth-first scan collecting SKILL.md / plugin.json paths. */
function findManifests(root: string): string[] {
  const found: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full)
      } else if (entry.name === 'SKILL.md' || entry.name === 'plugin.json') {
        found.push(full)
      }
    }
  }
  return found
}

/** Best-effort version read from a plugin.json manifest. */
function readPluginVersion(manifestPath: string): string {
  try {
    if (!statSync(manifestPath).isFile()) return '0.0.0'
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version?: unknown }
    return typeof parsed.version === 'string' && parsed.version ? parsed.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}
