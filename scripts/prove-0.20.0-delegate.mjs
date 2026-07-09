#!/usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Delegate-mode proof harness for the 0.20.0 wirings. Exercises every new
 * capability through the BUILT CLI with NO provider configured — proving the
 * provider is a fallback, not a requirement (`llm_call_ledger = 0` is correct).
 *
 * Exits non-zero on the first failed assertion. Run after `npm run build`:
 *   node scripts/prove-0.20.0-delegate.mjs
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(REPO, 'dist', 'cli', 'index.js')
let failures = 0

/** Run the CLI with NO provider env; return parsed JSON of last stdout line. */
function agf(args, cwd = REPO) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) {
    if (/API_KEY$|_TOKEN$/.test(k)) delete env[k] // strip every provider credential
  }
  const res = spawnSync('node', [CLI, ...args], { cwd, env, encoding: 'utf8' })
  const lines = (res.stdout || '').trim().split('\n').filter(Boolean)
  try {
    return JSON.parse(lines[lines.length - 1])
  } catch {
    return { ok: false, _raw: res.stdout, _err: res.stderr }
  }
}

function check(label, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${label}`)
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
    failures++
  }
}

const ws = mkdtempSync(join(tmpdir(), 'agf-prove-'))
try {
  agf(['init', '-d', ws])

  // ── Capability 1+2: tags + ACO deposit on done (delegate mode) ──────────────
  // The task carries real AC so the DoD gate inside `agf done` passes (≥60 INVEST);
  // only then does the completion path run and deposit on the task's tags.
  console.log('\n[1/4] ACO reward deposit on `agf done` (tags as trails)')
  const add = agf([
    'node',
    'add',
    '--title',
    'Deposit pheromone on task completion',
    '--type',
    'task',
    '--tags',
    'aco,colony',
    '--ac',
    'Given a done task with tags, when agf done runs, then pheromoneDeposited is greater than zero',
    '--ac',
    'Given zero LLM tokens, when DoD passes, then the deposited signal remains non-zero',
    '-d',
    ws,
  ])
  const id = add?.data?.id
  check('node add --tags returns id + tags', !!id && Array.isArray(add?.data?.tags) && add.data.tags.includes('aco'))
  agf(['node', 'status', id, 'in_progress', '-d', ws])
  const done = agf(['done', id, '--skip-test', '-d', ws])
  check(
    'agf done deposits non-zero pheromone with 0 tokens',
    typeof done?.data?.pheromoneDeposited === 'number' && done.data.pheromoneDeposited > 0,
    `pheromoneDeposited=${done?.data?.pheromoneDeposited}`,
  )

  // ── Capability 4: hard-block visibility on NO_TASKS ─────────────────────────
  console.log('\n[2/4] hard-block visibility on `agf next` NO_TASKS')
  const cAdd = agf(['node', 'add', '--title', 'Build corpus index', '--type', 'task', '-d', ws])
  agf(['node', 'status', cAdd.data.id, 'blocked', '-d', ws])
  const next = agf(['next', '-d', ws])
  const hb = next?.data?.hardBlocks
  check(
    'NO_TASKS envelope carries hardBlocks for the corpus task',
    Array.isArray(hb) && hb.some((b) => b.requiredRuntime === 'corpus'),
    JSON.stringify(next?.data),
  )

  // ── Capability 6: decision rationale round-trip ─────────────────────────────
  console.log('\n[3/4] decision rationale set/get round-trip')
  const rAdd = agf(['node', 'add', '--title', 'Pick SQLite', '--type', 'task', '-d', ws])
  agf([
    'node',
    'rationale',
    'set',
    rAdd.data.id,
    '--decision',
    'Use SQLite',
    '--why',
    'Embeddable',
    '--consequences',
    'No network concurrency',
    '--alternative',
    'Postgres',
    '-d',
    ws,
  ])
  const got = agf(['node', 'rationale', 'get', rAdd.data.id, '-d', ws])
  check(
    'rationale get returns the stored decision + alternatives',
    got?.data?.rationale?.decision === 'Use SQLite' && got.data.rationale.alternatives.includes('Postgres'),
  )

  // ── Capability 5: mutation gate (real apply→test→restore, repo cwd) ─────────
  console.log('\n[4/4] mutation gate `agf check --mutation` (real vitest, restores source)')
  const src = 'src/core/graph/normalize-tags.ts'
  const before = readFileSync(join(REPO, src), 'utf8')
  const mut = agf([
    'check',
    'epic-slash-commands',
    '--mutation',
    '--source',
    src,
    '--test',
    'src/tests/normalize-tags.test.ts',
    '--select',
    'data.mutation',
  ])
  const m = mut?.data?.mutation
  check(
    'mutation gate ran and produced a kill ratio',
    !!m && typeof m.killRatio === 'number' && m.total > 0,
    JSON.stringify(m),
  )
  const after = readFileSync(join(REPO, src), 'utf8')
  check('source file restored byte-identical after mutation pass', before === after)
  // The mutation gate must not introduce *tracked* changes. An untracked file
  // (`??`, e.g. a not-yet-committed source) is fine — byte-identity above already
  // proved restoration; here we only guard against a left-behind diff to a tracked file.
  const status = execSync(`git -C "${REPO}" status --porcelain "${src}"`).toString().trim()
  const leftTrackedDiff = status !== '' && !status.startsWith('??')
  check('mutation gate left no tracked diff on the source', !leftTrackedDiff, status)
} finally {
  rmSync(ws, { recursive: true, force: true })
}

console.log(
  `\n${failures === 0 ? '✓ ALL DELEGATE-MODE PROOFS PASSED' : `✗ ${failures} PROOF(S) FAILED`} (provider: none)`,
)
process.exit(failures === 0 ? 0 : 1)
