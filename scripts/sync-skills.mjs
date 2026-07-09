#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Syncs the canonical authored skills (`.agents/skills/<name>/SKILL.md`) to
 * two destinations:
 *   1. `skills/` in the repo root (for distribution + version control)
 *   2. `~/.claude/skills/` (user's global skill registry)
 *
 * Global-only skills (e.g. `golden-wren`) that have no `.agents/skills/` source
 * are left untouched.
 *
 * Usage:
 *   node scripts/sync-skills.mjs            # sync all skills to both destinations
 *   node scripts/sync-skills.mjs --dry-run  # show what would change, write nothing
 *   node scripts/sync-skills.mjs --only graph-implement,leafcutter
 *
 * Env overrides (for testing):
 *   AGF_AGENTS_SKILLS  — override .agents/skills/ path
 *   AGF_REPO_SKILLS    — override repo/skills/ path
 *   AGF_GLOBAL_SKILLS  — override ~/.claude/skills/ path
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_SKILLS = process.env.AGF_AGENTS_SKILLS ?? join(__dirname, '..', '.agents', 'skills')
const REPO_SKILLS = process.env.AGF_REPO_SKILLS ?? join(__dirname, '..', 'skills')
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

function syncFile(src, destDir, name) {
  const dest = join(destDir, 'SKILL.md')
  const srcBody = readFileSync(src, 'utf8')
  const exists = existsSync(dest)
  const destBody = exists ? readFileSync(dest, 'utf8') : null
  if (destBody === srcBody) return 'unchanged'
  if (!dryRun) {
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    writeFileSync(dest, srcBody, 'utf8')
  }
  return exists ? 'updated' : 'created'
}

const sourceSkills = listSkillDirs(AGENTS_SKILLS).filter((n) => !onlyList || onlyList.includes(n))
if (sourceSkills.length === 0) {
  console.error(`No skills found under ${AGENTS_SKILLS}${onlyList ? ` matching ${onlyList.join(',')}` : ''}`)
  process.exit(1)
}

let created = 0,
  updated = 0,
  unchanged = 0
for (const name of sourceSkills) {
  const src = join(AGENTS_SKILLS, name, 'SKILL.md')

  // Sync to repo/skills/
  const repoResult = syncFile(src, join(REPO_SKILLS, name), name)
  // Sync to ~/.claude/skills/
  const globalResult = syncFile(src, join(GLOBAL_SKILLS, name), name)

  // Report the "most interesting" change (created > updated > unchanged)
  const status =
    repoResult === 'created' || globalResult === 'created'
      ? 'created'
      : repoResult === 'updated' || globalResult === 'updated'
        ? 'updated'
        : 'unchanged'

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
