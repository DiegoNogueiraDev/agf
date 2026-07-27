/*!
 * connectivity-scanner — 9th harness dimension.
 *
 * WHY: capabilities in src/core/ that are never imported by any surface
 * (CLI/TUI/MCP/web/API) are "wired but disconnected" — they compile and pass tests
 * but are unreachable by users. audit-stubs misses these because they have no
 * placeholder markers. This dimension makes dormancy visible in the harness score.
 *
 * Score = (core files imported by ≥1 surface file) / total core files × 100.
 * Allowlisted paths (shared types, plugin contracts, internal infra) are excluded
 * from the denominator so they don't produce false-positive dormancy readings.
 *
 * Composes with: harness-scan-runner.ts (consumer), harnessability-score.ts (weight).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'

export interface ConnectivityScanOptions {
  rootDir: string
  /** Path prefixes (relative to rootDir) to exclude from the scan — e.g. shared types, infra. */
  allowlist?: string[]
}

export interface ConnectivityScanResult {
  connectivityScore: number
  totalCapabilities: number
  connectedCapabilities: number
  /** Relative paths (from rootDir) of core files with no surface import. */
  dormantFiles: string[]
}

const SURFACE_DIRS = ['src/cli', 'src/tui', 'src/mcp', 'src/web', 'src/app-server', 'src/api']
const CORE_DIR = 'src/core'

function gatherTsFiles(dir: string): string[] {
  const results: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      results.push(...gatherTsFiles(full))
    } else if (
      // Include .tsx/.jsx so React/Ink surfaces (src/tui) are scanned — a core
      // module reachable only via the TUI is connected, not dormant. Exclude
      // test files and ambient declarations regardless of extension.
      /\.(ts|tsx|jsx)$/.test(entry) &&
      !/\.test\.(ts|tsx|jsx)$/.test(entry) &&
      !entry.endsWith('.d.ts')
    ) {
      results.push(full)
    }
  }
  return results
}

function readImportPaths(file: string): Set<string> {
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return new Set()
  }
  const imports = new Set<string>()
  // Static: `from '...'` and `export ... from '...'`
  const staticRe = /from\s+['"]([^'"]+)['"]/g
  // Dynamic: `import('...')` and `await import('...')` (lazy CLI loaders / lazy core wiring)
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = staticRe.exec(content)) !== null) imports.add(m[1])
  while ((m = dynamicRe.exec(content)) !== null) imports.add(m[1])
  return imports
}

function isAllowlisted(relPath: string, allowlist: string[]): boolean {
  return allowlist.some((a) => relPath.startsWith(a) || relPath.includes(a))
}

/**
 * Resolve one import string from a core file to the rel-path of the core file it
 * targets (or null if it points outside the core set). Relative imports are
 * resolved against the importer's directory; bare specifiers are matched by stem.
 * This builds the core→core edge used for transitive reachability.
 */
function resolveCoreImport(
  rootDir: string,
  fileAbs: string,
  imp: string,
  relSet: Set<string>,
  stemToRel: Map<string, string>,
): string | null {
  if (imp.startsWith('.')) {
    const abs = resolve(dirname(fileAbs), imp)
    const base = relative(rootDir, abs)
      .replace(/\\/g, '/')
      .replace(/\.(js|ts)$/, '')
    for (const cand of [`${base}.ts`, `${base}/index.ts`]) {
      if (relSet.has(cand)) return cand
    }
    return null
  }
  const stripped = imp.replace(/\.(js|ts)$/, '')
  for (const [stem, rel] of stemToRel) {
    if (stripped.includes(stem)) return rel
  }
  return null
}

/**
 * Scan for core capabilities reachable from at least one surface directory.
 * Returns score 100 when no core files exist (nothing to measure).
 */
export function scanConnectivity(opts: ConnectivityScanOptions): ConnectivityScanResult {
  const { rootDir, allowlist = [] } = opts

  // Collect core capability files
  const coreAbsDir = join(rootDir, CORE_DIR)
  const allCoreFiles = gatherTsFiles(coreAbsDir)
  const coreFiles = allCoreFiles.filter((f) => {
    const rel = relative(rootDir, f).replace(/\\/g, '/')
    return !isAllowlisted(rel, allowlist)
  })

  if (coreFiles.length === 0) {
    return { connectivityScore: 100, totalCapabilities: 0, connectedCapabilities: 0, dormantFiles: [] }
  }

  // Build set of all import strings from surface files
  const surfaceImports = new Set<string>()
  for (const surfaceDir of SURFACE_DIRS) {
    const absDir = join(rootDir, surfaceDir)
    const surfaceFiles = gatherTsFiles(absDir)
    for (const sf of surfaceFiles) {
      for (const imp of readImportPaths(sf)) {
        surfaceImports.add(imp)
      }
    }
  }

  // Build the core→core import graph + lookup tables for reachability.
  const coreRel = coreFiles.map((f) => relative(rootDir, f).replace(/\\/g, '/'))
  const relSet = new Set(coreRel)
  const stemToRel = new Map<string, string>()
  for (const rel of coreRel) stemToRel.set(rel.replace(/^src\//, '').replace(/\.ts$/, ''), rel)

  const importsOf = new Map<string, Set<string>>()
  for (const coreFile of coreFiles) {
    const rel = relative(rootDir, coreFile).replace(/\\/g, '/')
    const targets = new Set<string>()
    for (const imp of readImportPaths(coreFile)) {
      const t = resolveCoreImport(rootDir, coreFile, imp, relSet, stemToRel)
      if (t && t !== rel) targets.add(t)
    }
    importsOf.set(rel, targets)
  }

  // Seed reachability with core files DIRECTLY imported by a surface file, then
  // propagate transitively through the core→core graph (surface → A → B → …).
  const reachable = new Set<string>()
  const queue: string[] = []
  for (const rel of coreRel) {
    const stem = rel.replace(/^src\//, '').replace(/\.ts$/, '')
    for (const imp of surfaceImports) {
      if (imp.includes(stem)) {
        reachable.add(rel)
        queue.push(rel)
        break
      }
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift() as string
    for (const t of importsOf.get(cur) ?? []) {
      if (!reachable.has(t)) {
        reachable.add(t)
        queue.push(t)
      }
    }
  }

  // Barrels (index.ts) re-export other modules — they aggregate, they are not
  // capabilities. Keep them in the reachability graph above (they propagate
  // surface→barrel→module), but exclude them from the capability count so an
  // unimported barrel is not a false "dormant capability".
  const isCapability = (rel: string): boolean => !rel.endsWith('/index.ts')
  const capabilities = coreRel.filter(isCapability)
  const dormantFiles = capabilities.filter((rel) => !reachable.has(rel))
  const connectedCapabilities = capabilities.length - dormantFiles.length
  const connectivityScore =
    capabilities.length === 0 ? 100 : Math.round((connectedCapabilities / capabilities.length) * 100)

  return {
    connectivityScore,
    totalCapabilities: capabilities.length,
    connectedCapabilities,
    dormantFiles,
  }
}
