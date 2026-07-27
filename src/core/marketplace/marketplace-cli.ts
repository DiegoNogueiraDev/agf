/*!
 * marketplace-cli — pure envelope builder for `agf marketplace` actions.
 *
 * WHY: Keeps CLI command thin — all list/install/upgrade logic is testable
 * without a real MarketplaceStore or disk I/O.
 *
 * Composes with: marketplace.ts (MarketplaceStore), marketplace-cmd.ts (CLI).
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { MarketplaceItem, MarketplaceSource } from './types.js'

export interface MarketplaceListDeps {
  getSources: () => MarketplaceSource[]
  getItems: (sourceId?: string) => MarketplaceItem[]
}

export type MarketplaceEnvelope =
  | { ok: true; data: { sources: MarketplaceSource[]; items: MarketplaceItem[] } }
  | { ok: false; code: string; error: string }

export function buildMarketplaceEnvelope(action: 'list', deps: MarketplaceListDeps): MarketplaceEnvelope {
  if (action === 'list') {
    const sources = deps.getSources()
    const items = sources.flatMap((s) => deps.getItems(s.id))
    return { ok: true, data: { sources, items } }
  }
  return { ok: false, code: 'UNKNOWN_ACTION', error: `Unknown action: ${action}` }
}

/** One file to copy from the cloned source into the CLI's skills directory. */
export interface InstallCopy {
  from: string
  to: string
}

/**
 * What an install would write — decided, not performed.
 *
 * WHY a plan instead of a function that copies: `agf skill install` writes OUTSIDE
 * the project, into the skills directory of the user's CLI (their HOME), where
 * hand-authored skills live. Separating the decision from the I/O keeps every rule
 * about WHAT gets written unit-testable with no disk, and makes the all-or-nothing
 * guarantee structural: a failed lookup returns no copies at all, so there is no
 * code path that can leave a half-written skill folder behind.
 */
export type InstallPlan =
  { ok: true; skill: string; copies: InstallCopy[] } | { ok: false; code: string; error: string }

/**
 * Plan the installation of one indexed skill into `destRoot`.
 *
 * The destination mirrors the skill's own folder name (`<destRoot>/<skill>/SKILL.md`)
 * so it is discoverable by the same directory walk that lists skills. Source paths
 * come from the indexer's recorded `manifestPath` — never re-derived by convention,
 * because a source may nest its skills and a guessed layout silently copies the
 * wrong tree.
 */
export function buildInstallPlan(
  items: readonly MarketplaceItem[],
  skillId: string,
  destRoot: string,
  /** Clone root of the item's source. A map keyed by sourceId when several are registered. */
  sourceRoot?: string | ReadonlyMap<string, string>,
): InstallPlan {
  const matches = items.filter((i) => i.id === skillId && i.kind === 'skill')
  if (matches.length === 0) {
    return { ok: false, code: 'NOT_FOUND', error: `skill not found in indexed sources: ${skillId}` }
  }

  // Two sources publishing the same name is a choice only the user can make.
  // Picking one silently installs something they did not choose, with no signal
  // that an alternative existed.
  const sources = [...new Set(matches.map((m) => m.sourceId))]
  if (sources.length > 1) {
    return {
      ok: false,
      code: 'AMBIGUOUS_SKILL',
      error: `"${skillId}" exists in ${sources.length} sources: ${sources.join(', ')} — pick one with --source`,
    }
  }
  const item = matches[0]

  const destDir = path.join(destRoot, item.id)
  const copies: InstallCopy[] = [{ from: item.manifestPath, to: path.join(destDir, path.basename(item.manifestPath)) }]

  // Resolve against the root of the source THIS item came from — with several
  // sources registered, the last-fetched one is not necessarily the owner.
  const itemRoot = typeof sourceRoot === 'string' ? sourceRoot : sourceRoot?.get(item.sourceId)
  if (itemRoot) {
    const refs = resolveReferences(item.manifestPath, itemRoot)
    if (!refs.ok) return refs
    for (const ref of refs.paths) copies.push({ from: ref.from, to: path.join(destDir, ref.rel) })
  }

  return { ok: true, skill: item.id, copies }
}

/**
 * Companion files a manifest points at: `_shared.md`, [x](references/y.md), plain mentions.
 * Path segments are allowed so a reference into a subfolder keeps its layout.
 *
 * Deliberately ONE flat character class rather than nested quantifiers: the input is a
 * manifest from someone else's repository, and a pattern that can backtrack turns a
 * hostile file into a hang.
 */
const REFERENCE_PATTERN = /[\w][\w./-]*\.md/g

/**
 * `[label](target.md)` — the only UNAMBIGUOUS statement that a manifest depends on
 * a file. A bare mention is included when it resolves, but never fatal when it does
 * not: skills legitimately name files they do not ship.
 */
const MARKDOWN_LINK_PATTERN = /\]\(([^)\s]+\.md)\)/g

/**
 * Resolve every companion file a manifest references, or report the first that is missing.
 *
 * WHY the closure and not the whole repo: a source may hold unrelated files (READMEs,
 * other skills' assets). Copying everything would install noise; copying only SKILL.md
 * installs dangling pointers. The set the manifest actually names is the only definition
 * of "this skill's bundle" that stays correct as the source is reorganized — which is why
 * it is derived here rather than hardcoded to the filenames one repo happens to use today.
 *
 * A named-but-absent file is reported, never skipped: silently installing a skill whose
 * doctrine is missing is the failure this exists to prevent.
 */
interface ResolvedReference {
  from: string
  /** Path relative to the skill folder, preserving any subfolder the manifest used. */
  rel: string
}

/**
 * Reject prose that merely looks like a path. A `.md` file cannot contain children,
 * so a token with `.md/` inside it (`CLAUDE.md/AGENTS.md` — shorthand for "both of
 * these files") is text about two files, never one path. Without this guard every
 * real-world skill fails to install with a bogus missing-file error.
 */
function isPathShaped(token: string): boolean {
  return !token.includes('.md/')
}

function resolveReferences(
  manifestPath: string,
  sourceRoot: string,
): { ok: true; paths: ResolvedReference[] } | { ok: false; code: string; error: string } {
  const manifestDir = path.dirname(manifestPath)
  const own = path.basename(manifestPath)
  let body: string
  try {
    body = readFileSync(manifestPath, 'utf8')
  } catch {
    return { ok: false, code: 'NOT_FOUND', error: `manifest unreadable: ${manifestPath}` }
  }

  const linked = new Set([...body.matchAll(MARKDOWN_LINK_PATTERN)].map((m) => m[1]))
  const named = [...new Set(body.match(REFERENCE_PATTERN) ?? [])].filter((n) => n !== own && isPathShaped(n))
  const resolved: ResolvedReference[] = []
  for (const name of named) {
    // Sibling first (a skill's own asset), then the source root (shared doctrine).
    const candidate = [path.join(manifestDir, name), path.join(sourceRoot, name)].find((p) => existsSync(p))
    if (!candidate) {
      // Only an explicit markdown link is unambiguous intent to depend on a file.
      // A bare mention that resolves to nothing is prose ABOUT a filename — real
      // skills discuss `CLAUDE.md` or `package.json` without shipping them.
      if (!linked.has(name)) continue
      return { ok: false, code: 'BROKEN_REFERENCE', error: `${own} links to a file missing from the source: ${name}` }
    }
    // Keep the relative shape the manifest used, so its own links still resolve
    // after the copy. Flattening breaks the link the reference exists to satisfy.
    resolved.push({
      from: candidate,
      rel: candidate.startsWith(manifestDir) ? path.relative(manifestDir, candidate) : path.basename(candidate),
    })
  }
  return { ok: true, paths: resolved }
}

/** Sidecar recording what WE wrote, so a later run can tell our output from a human edit. */
export const PROVENANCE_FILE = '.agf-install.json'

interface ProvenanceRecord {
  version: 1
  files: Record<string, string>
}

/**
 * Content hash of a file, from its bytes.
 *
 * Deliberately an explicit sha256 over the content rather than any runtime-provided
 * hash: this value is written to disk and compared by a DIFFERENT process on the next
 * install. A per-process hash would match inside one run and silently differ on the
 * next, turning every second install into a false "you edited this".
 */
function hashFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

/** Record the hashes of `relFiles` (relative to `destDir`) as our provenance. */
export function writeProvenance(destDir: string, relFiles: readonly string[]): void {
  const files: Record<string, string> = {}
  for (const rel of relFiles) {
    const full = path.join(destDir, rel)
    if (existsSync(full)) files[rel] = hashFile(full)
  }
  const record: ProvenanceRecord = { version: 1, files }
  writeFileSync(path.join(destDir, PROVENANCE_FILE), JSON.stringify(record, null, 2), 'utf8')
}

/** What the install is allowed to do with an existing destination. */
export type InstallAssessment =
  { ok: true; action: 'install' | 'update' | 'overwrite' } | { ok: false; code: string; error: string }

/**
 * Decide whether it is safe to write into `destDir`.
 *
 * The destination lives in the user's own skills folder, beside skills they may have
 * authored. There is no git there to recover from, so the rule is provenance, not
 * heuristics: a file may be replaced only when its current content still hashes to
 * what we recorded when we wrote it. Anything else — a hand edit, or content we never
 * recorded at all — is REFUSED, and refusal is what the unrecognized case gets by
 * default. `force` is the user's explicit consent; the block is a default, not a wall.
 *
 * This function never writes: a refusal cannot leave a half-updated skill behind.
 */
export function assessInstallTarget(destDir: string, options: { force?: boolean } = {}): InstallAssessment {
  if (options.force) return { ok: true, action: 'overwrite' }
  if (!existsSync(destDir)) return { ok: true, action: 'install' }

  const present = readdirSync(destDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== PROVENANCE_FILE)
    .map((e) => e.name)
  if (present.length === 0) return { ok: true, action: 'install' }

  const recorded = readProvenance(destDir)
  if (!recorded) {
    return {
      ok: false,
      code: 'UNKNOWN_CONTENT',
      error: `${destDir} already holds files agf did not install — refusing to overwrite`,
    }
  }

  for (const name of present) {
    const expected = recorded.files[name]
    if (!expected) {
      return { ok: false, code: 'UNKNOWN_CONTENT', error: `${name} was not installed by agf — refusing to overwrite` }
    }
    if (hashFile(path.join(destDir, name)) !== expected) {
      return { ok: false, code: 'MODIFIED_LOCALLY', error: `${name} was edited after install — refusing to overwrite` }
    }
  }
  return { ok: true, action: 'update' }
}

function readProvenance(destDir: string): ProvenanceRecord | null {
  const file = path.join(destDir, PROVENANCE_FILE)
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as ProvenanceRecord
    return parsed && typeof parsed.files === 'object' ? parsed : null
  } catch {
    return null
  }
}
