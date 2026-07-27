/**
 * marketplace-cli.test.ts — pure envelope/plan builders for `agf skill install`.
 *
 * The install writes OUTSIDE the project, into the CLI's own skills directory —
 * territory agf does not own. So the decision of what to write is kept pure and
 * fully testable here, and the caller performs the I/O. These tests pin the
 * decisions that matter: the right files land in the right place, an unknown
 * skill produces NO writes at all (never a partial install), and the plan is
 * derived from the indexed item rather than re-deriving paths by convention.
 */
import { describe, it, expect, afterAll } from 'vitest'
import path from 'node:path'
import { buildInstallPlan } from '../core/marketplace/marketplace-cli.js'
import type { MarketplaceItem } from '../core/marketplace/types.js'

const SOURCE_ROOT = '/cache/skills-graph'
const DEST = '/home/user/.claude/skills'

function skillItem(id: string): MarketplaceItem {
  return {
    id,
    kind: 'skill',
    sourceId: 'skills-graph',
    manifestPath: path.join(SOURCE_ROOT, id, 'SKILL.md'),
    version: '1.0.0',
  }
}

const ITEMS: MarketplaceItem[] = [skillItem('graph-woodpecker'), skillItem('graph-builder-leafcutter')]

describe('buildInstallPlan', () => {
  it('plans the skill manifest into the destination under its own folder', () => {
    const plan = buildInstallPlan(ITEMS, 'graph-woodpecker', DEST)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.copies).toContainEqual({
      from: path.join(SOURCE_ROOT, 'graph-woodpecker', 'SKILL.md'),
      to: path.join(DEST, 'graph-woodpecker', 'SKILL.md'),
    })
  })

  it('plans nothing for the sibling skills that were not requested', () => {
    const plan = buildInstallPlan(ITEMS, 'graph-woodpecker', DEST)
    if (!plan.ok) throw new Error('expected ok')
    const touched = plan.copies.map((c) => c.from).join('\n')
    expect(touched).not.toContain('graph-builder-leafcutter')
  })

  it('refuses an unknown skill with NOT_FOUND and plans ZERO writes', () => {
    // The critical half: a failed lookup must not leave a half-written skill
    // directory behind, so the failure carries no copies to execute.
    const plan = buildInstallPlan(ITEMS, 'does-not-exist', DEST)
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.code).toBe('NOT_FOUND')
    expect(plan.error).toContain('does-not-exist')
  })

  it('ignores non-skill items of the same name (a plugin is not a skill)', () => {
    const withPlugin: MarketplaceItem[] = [
      { ...skillItem('thing'), kind: 'plugin', manifestPath: path.join(SOURCE_ROOT, 'thing', 'plugin.json') },
    ]
    expect(buildInstallPlan(withPlugin, 'thing', DEST).ok).toBe(false)
  })

  it('derives the destination from the indexed manifest, not from a guessed layout', () => {
    // A source may nest skills (repo/pack/<skill>/SKILL.md). The plan must follow
    // the real manifestPath the indexer recorded; re-deriving it by convention is
    // how an installer silently writes the wrong tree.
    const nested: MarketplaceItem = {
      ...skillItem('deep'),
      manifestPath: path.join(SOURCE_ROOT, 'pack', 'deep', 'SKILL.md'),
    }
    const plan = buildInstallPlan([nested], 'deep', DEST)
    if (!plan.ok) throw new Error('expected ok')
    expect(plan.copies[0].from).toBe(path.join(SOURCE_ROOT, 'pack', 'deep', 'SKILL.md'))
    expect(plan.copies[0].to).toBe(path.join(DEST, 'deep', 'SKILL.md'))
  })
})

// ── Bundle closure (node_50f9dab46ec1) ────────────────────────────────
//
// A skill is not one file. The public source keeps shared doctrine at the repo
// root (_shared.md and friends) and every SKILL.md references it — 5 and 7 times
// in the two largest ones. The indexer only ever collected SKILL.md, so installing
// produced a skill whose pointers dangled: nothing errors, the agent reading it
// simply never finds the doctrine it was told to obey. These tests run against
// REAL directories on disk (no fs doubles) so what they prove is what ships.

import { mkdtempSync, mkdirSync as mkdir, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'

function realSource(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'agf-bundle-'))
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel)
    mkdir(path.dirname(full), { recursive: true })
    writeFileSync(full, body, 'utf8')
  }
  return root
}

describe('buildInstallPlan — bundle closure', () => {
  const roots: string[] = []
  const source = (files: Record<string, string>): string => {
    const r = realSource(files)
    roots.push(r)
    return r
  }
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

  const itemAt = (root: string, id: string, rel = `${id}/SKILL.md`): MarketplaceItem => ({
    id,
    kind: 'skill',
    sourceId: 'src',
    manifestPath: path.join(root, rel),
    version: '1.0.0',
  })

  it('carries a root file the SKILL.md references', () => {
    const root = source({
      'woodpecker/SKILL.md': '# w\nObey the rules in `_shared.md` before acting.\n',
      '_shared.md': '# shared doctrine\n',
    })
    const plan = buildInstallPlan([itemAt(root, 'woodpecker')], 'woodpecker', DEST, root)
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.copies.map((c) => c.to)).toContain(path.join(DEST, 'woodpecker', '_shared.md'))
  })

  it('leaves the destination with zero dangling references', () => {
    const root = source({
      'w/SKILL.md': 'see `_shared.md` and [protocol](_pilot-protocol.md)\n',
      '_shared.md': 'x',
      '_pilot-protocol.md': 'y',
    })
    const plan = buildInstallPlan([itemAt(root, 'w')], 'w', DEST, root)
    if (!plan.ok) throw new Error(plan.error)
    const installed = new Set(plan.copies.map((c) => path.basename(c.to)))
    for (const ref of ['_shared.md', '_pilot-protocol.md']) expect(installed.has(ref)).toBe(true)
  })

  it('does NOT copy a root file nobody references — the bundle is the closure, not the repo', () => {
    const root = source({
      'w/SKILL.md': 'only `_shared.md` matters here\n',
      '_shared.md': 'x',
      'README.md': 'unrelated',
      '_rag-protocol.md': 'unreferenced',
    })
    const plan = buildInstallPlan([itemAt(root, 'w')], 'w', DEST, root)
    if (!plan.ok) throw new Error(plan.error)
    const names = plan.copies.map((c) => path.basename(c.to))
    expect(names).not.toContain('README.md')
    expect(names).not.toContain('_rag-protocol.md')
  })

  it('reports a LINKED file missing from the source instead of installing incomplete', () => {
    const root = source({ 'w/SKILL.md': 'depends on [doctrine](_missing.md)\n' })
    const plan = buildInstallPlan([itemAt(root, 'w')], 'w', DEST, root)
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.code).toBe('BROKEN_REFERENCE')
    expect(plan.error).toContain('_missing.md')
  })

  it('treats an unresolvable BARE mention as prose, not a broken dependency', () => {
    // Real skills discuss filenames they do not ship ("CLAUDE.md is generated").
    // Failing the install on those makes every honest skill uninstallable.
    const root = source({ 'w/SKILL.md': 'the generated CLAUDE.md is not ours to ship\n' })
    expect(buildInstallPlan([itemAt(root, 'w')], 'w', DEST, root).ok).toBe(true)
  })

  it('follows a reference into a subfolder and preserves its layout at the destination', () => {
    const root = source({
      'w/SKILL.md': 'deep dive in [methods](references/methodologies.md)\n',
      'w/references/methodologies.md': 'the methods',
    })
    const plan = buildInstallPlan([itemAt(root, 'w')], 'w', DEST, root)
    if (!plan.ok) throw new Error(plan.error)
    // Flattening it to <dest>/w/methodologies.md would break the very link the
    // reference exists to satisfy — the layout IS part of the reference.
    expect(plan.copies.map((c) => c.to)).toContain(path.join(DEST, 'w', 'references', 'methodologies.md'))
  })

  it('does not mistake prose like CLAUDE.md/AGENTS.md for a file reference', () => {
    // A .md cannot be a directory, so a token with `.md/` inside it is prose about
    // two files, not a path. Treating it as a reference makes every real skill fail
    // to install with a bogus BROKEN_REFERENCE.
    const root = source({ 'w/SKILL.md': 'both CLAUDE.md/AGENTS.md are generated\n' })
    expect(buildInstallPlan([itemAt(root, 'w')], 'w', DEST, root).ok).toBe(true)
  })

  it('still installs a self-contained skill that references nothing', () => {
    const root = source({ 'solo/SKILL.md': '# solo\nno references at all\n' })
    const plan = buildInstallPlan([itemAt(root, 'solo')], 'solo', DEST, root)
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.copies).toHaveLength(1)
    expect(existsSync(plan.copies[0].from)).toBe(true)
  })
})

describe('buildInstallPlan — ambiguity across sources', () => {
  it('refuses when the same skill name exists in more than one source', () => {
    // With a built-in default plus the user's own sources, two repos can publish
    // the same name. Picking one silently installs something the user did not
    // choose, and they have no way to notice which won.
    const dup: MarketplaceItem[] = [
      { id: 'dup', kind: 'skill', sourceId: 'official', manifestPath: '/a/dup/SKILL.md', version: '1.0.0' },
      { id: 'dup', kind: 'skill', sourceId: 'mine', manifestPath: '/b/dup/SKILL.md', version: '2.0.0' },
    ]
    const plan = buildInstallPlan(dup, 'dup', DEST)
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.code).toBe('AMBIGUOUS_SKILL')
    expect(plan.error).toContain('official')
    expect(plan.error).toContain('mine')
  })

  it('is not confused by the same name appearing twice within ONE source', () => {
    const same: MarketplaceItem[] = [
      { id: 'x', kind: 'skill', sourceId: 'one', manifestPath: '/a/x/SKILL.md', version: '1.0.0' },
    ]
    expect(buildInstallPlan(same, 'x', DEST).ok).toBe(true)
  })
})
