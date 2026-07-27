#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Produces the public skills repository from `.agents/skills/`, the one authored
 * source.
 *
 * WHY a script and not a copy-paste: the public repo used to be updated by hand.
 * It fell behind, and the drift was not visible from either side. It taught agents
 * a command (`agf rtk`) that had been deleted, and shipped a skill whose frontmatter
 * no loader could parse — a colon inside an unquoted YAML scalar — so the skill
 * silently never appeared. Nobody saw either problem, because seeing them required
 * comparing two directories nobody was comparing.
 *
 * Only the three lifecycle pillars and the shared protocols are published. The rest
 * are project-specific: they name `agf` commands and assume this repository's graph.
 *
 * Before writing anything, every file is validated the way a loader reads it — parse
 * the YAML, check `name`, check the 1024-character description limit. A skill that
 * cannot be parsed is never offered, and the failure is silent, so the check must
 * not be.
 *
 * Usage:
 *   node scripts/sync-public-skills.mjs <path-to-skills-graph-clone> [--dry-run]
 */

import { readFileSync, existsSync, mkdirSync, cpSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(REPO, '.agents', 'skills')

/** What the public repository is for: the three pillars, and what they share. */
const PUBLIC_SKILLS = ['graph-backlog-generation', 'graph-builder-leafcutter', 'graph-woodpecker']
const PUBLIC_FILES = ['_shared.md', '_pilot-protocol.md', '_pilot-protocol-template.md', '_rag-protocol.md']

const DESCRIPTION_MAX = 1024
const NAME_MAX = 64

/** Read a SKILL.md the way a loader does. Returns a list of problems, empty when valid. */
function validate(path, expectedName) {
  const source = readFileSync(path, 'utf8')
  if (!source.startsWith('---\n')) return ['no frontmatter: must open with `---` on line 1']
  const end = source.indexOf('\n---', 4)
  if (end === -1) return ['frontmatter never closes']

  let meta
  try {
    meta = parseYaml(source.slice(4, end))
  } catch (err) {
    // The classic break: `description: … (BUILD): this is HARDEN`. Quote it.
    return [`frontmatter is not valid YAML — ${String(err).split('\n')[0]}`]
  }

  const problems = []
  if (typeof meta?.name !== 'string') problems.push('`name` is missing')
  else if (meta.name !== expectedName) problems.push(`\`name\` is "${meta.name}", directory is "${expectedName}"`)
  else if (meta.name.length > NAME_MAX) problems.push(`\`name\` is ${meta.name.length} chars (max ${NAME_MAX})`)

  if (typeof meta?.description !== 'string') problems.push('`description` is missing')
  else if (meta.description.length > DESCRIPTION_MAX)
    problems.push(
      `\`description\` is ${meta.description.length} chars (max ${DESCRIPTION_MAX}) — the skill would never be listed`,
    )

  return problems
}

const target = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

if (!target || !existsSync(target)) {
  process.stderr.write('usage: node scripts/sync-public-skills.mjs <path-to-skills-graph-clone> [--dry-run]\n')
  process.exit(1)
}

let failed = false
for (const name of PUBLIC_SKILLS) {
  const skillMd = join(SOURCE, name, 'SKILL.md')
  if (!existsSync(skillMd)) {
    process.stderr.write(`✖ ${name}: absent from .agents/skills\n`)
    failed = true
    continue
  }
  for (const problem of validate(skillMd, name)) {
    process.stderr.write(`✖ ${name}: ${problem}\n`)
    failed = true
  }
}

if (failed) {
  process.stderr.write('\n✖ Refusing to publish a skill a loader would silently drop.\n')
  process.exit(1)
}

if (dryRun) {
  process.stdout.write(`(dry-run) would publish ${PUBLIC_SKILLS.length} skills + ${PUBLIC_FILES.length} shared files\n`)
  process.exit(0)
}

for (const name of PUBLIC_SKILLS) {
  const dest = join(target, name)
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  cpSync(join(SOURCE, name), dest, { recursive: true })
  process.stdout.write(`  ${name}  (${readdirSync(dest).length} entries)\n`)
}
for (const file of PUBLIC_FILES) {
  const src = join(SOURCE, file)
  if (existsSync(src)) cpSync(src, join(target, file))
}

process.stdout.write(`\n✓ ${PUBLIC_SKILLS.length} skills published to ${target}\n`)
process.stdout.write('  Review `git diff` there, then commit. This script does not commit for you.\n')
