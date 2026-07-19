#! /usr/bin/env node
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Pre-push blast gate (node_984daec4f1ca / risk node_242a3ca1f072). Unlike
 * `test:blast` (vitest --changed HEAD, which reads the dirty WORKING TREE),
 * this diffs the COMMITTED range about to be pushed and hands only that to
 * `vitest related` — so another ant's untracked RED file mid-TDD can never
 * fail someone else's clean push. See scripts/push-range-files.mjs for the
 * unit-tested range/filter logic this script wires together.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { resolvePushDiffRange, parseDiffOutput, filterToExistingTsFiles } from './push-range-files.mjs'

function hasPushUpstream() {
  try {
    execFileSync('git', ['rev-parse', '--verify', '@{push}'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function diffRangeFiles(range) {
  try {
    return execFileSync('git', ['diff', '--name-only', range], { encoding: 'utf-8' })
  } catch {
    // Range endpoint doesn't exist yet (e.g. origin/main missing locally) — treat as empty.
    return ''
  }
}

function main() {
  const range = resolvePushDiffRange(hasPushUpstream())
  const changed = filterToExistingTsFiles(parseDiffOutput(diffRangeFiles(range)), existsSync)

  if (changed.length === 0) {
    console.log(`test:blast:push — range ${range} vazio, nada a validar.`)
    process.exit(0)
  }

  console.log(`test:blast:push — range ${range}: ${changed.length} arquivo(s) .ts, rodando vitest related…`)
  const result = spawnSync('npx', ['vitest', 'related', '--run', '--project=node', ...changed], {
    stdio: 'inherit',
  })
  process.exit(result.status ?? 1)
}

main()
