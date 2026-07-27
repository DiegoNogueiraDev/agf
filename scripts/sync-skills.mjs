#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Mirrors the one authored source (`.agents/skills/`) to `~/.claude/skills/`, the global
 * registry an agent actually reads. One direction, one destination: the repo-root `skills/`
 * mirror was retired because nothing loaded it and it drifted.
 *
 * A skill is more than its SKILL.md. It carries `references/*.md`, and all of them lean on
 * the shared root protocols (`_shared.md`, `_rag-protocol.md`, `_pilot-protocol*.md`).
 * Copying SKILL.md alone left the rest behind, and the global copy kept asserting things the
 * code had already stopped doing. Everything authored is mirrored, or the mirror lies.
 *
 * Global-only skills (e.g. internal deploy runbooks) that have no `.agents/skills/` source
 * are left untouched — this script never deletes.
 *
 * Usage:
 *   node scripts/sync-skills.mjs            # mirror every authored skill + shared protocol
 *   node scripts/sync-skills.mjs --dry-run  # show what would change, write nothing
 *   node scripts/sync-skills.mjs --only graph-implement,leafcutter
 *
 * Env overrides (for testing):
 *   AGF_AGENTS_SKILLS  — override .agents/skills/ path
 *   AGF_GLOBAL_SKILLS  — override ~/.claude/skills/ path
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_SKILLS = process.env.AGF_AGENTS_SKILLS ?? join(__dirname, '..', '.agents', 'skills')
const GLOBAL_SKILLS = process.env.AGF_GLOBAL_SKILLS ?? join(homedir(), '.claude', 'skills')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const onlyArg = args.find((a) => a.startsWith('--only'))
const onlyList = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null

function listSkillDirs(base) {
  if (!existsSync(base)) return []
  return readdirSync(base).filter((name) => {
    const p = join(base, name)
    return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'))
  })
}

/** Copy one file, reporting what it did. Identical content is never rewritten. */
function copyOne(src, dest) {
  const srcBody = readFileSync(src, 'utf8')
  const exists = existsSync(dest)
  if (exists && readFileSync(dest, 'utf8') === srcBody) return 'unchanged'
  if (!dryRun) {
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, srcBody, 'utf8')
  }
  return exists ? 'updated' : 'created'
}

/** Every file under `dir`, at any depth, as paths relative to `dir`. */
function filesUnder(dir, prefix = '') {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const rel = join(prefix, entry.name)
    return entry.isDirectory() ? filesUnder(dir, rel) : [rel]
  })
}

/** The strongest status wins: a skill that gained a file is `created`, not `unchanged`. */
function strongest(statuses) {
  if (statuses.includes('created')) return 'created'
  if (statuses.includes('updated')) return 'updated'
  return 'unchanged'
}

/** Mirror a whole skill — SKILL.md and every `references/` file it carries. */
function syncSkill(srcDir, destDir) {
  return strongest(filesUnder(srcDir).map((rel) => copyOne(join(srcDir, rel), join(destDir, rel))))
}

/** The shared spine (`_shared.md`, `_rag-protocol.md`, …) that every skill points at. */
function syncSharedProtocols(srcRoot, destRoot) {
  const shared = readdirSync(srcRoot, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.startsWith('_') && e.name.endsWith('.md'))
    .map((e) => e.name)

  for (const name of shared) {
    const status = copyOne(join(srcRoot, name), join(destRoot, name))
    if (status !== 'unchanged') {
      console.log(`${dryRun ? '[dry] ' : ''}${status === 'created' ? 'CREATE' : 'UPDATE'}  ${name}`)
    }
  }
}

const sourceSkills = listSkillDirs(AGENTS_SKILLS).filter((n) => !onlyList || onlyList.includes(n))
if (sourceSkills.length === 0) {
  console.error(`No skills found under ${AGENTS_SKILLS}${onlyList ? ` matching ${onlyList.join(',')}` : ''}`)
  process.exit(1)
}

let created = 0,
  updated = 0,
  unchanged = 0
syncSharedProtocols(AGENTS_SKILLS, GLOBAL_SKILLS)

for (const name of sourceSkills) {
  const status = syncSkill(join(AGENTS_SKILLS, name), join(GLOBAL_SKILLS, name))

  if (status !== 'unchanged') {
    const tag = status === 'created' ? 'CREATE' : 'UPDATE'
    console.log(`${dryRun ? '[dry] ' : ''}${tag}  ${name}`)
  }

  if (status === 'created') created++
  else if (status === 'updated') updated++
  else unchanged++
}

console.log(
  `\n${dryRun ? '(dry-run) ' : ''}${created} created, ${updated} updated, ${unchanged} unchanged (of ${sourceSkills.length} skills)`,
)
