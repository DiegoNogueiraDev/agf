/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Pure helpers for the pre-push blast gate (`scripts/test-blast-push.mjs`).
 * Extracted so the range/filter decisions are unit-testable without shelling
 * out to git or vitest (mirrors scripts/bun-targets.mjs's split from
 * pack-bun.mjs — the executor imports these, tests import these directly).
 */

/**
 * The committed-range diff target: `@{push}..HEAD` when the branch has a
 * push destination (so the gate covers exactly what's about to reach the
 * remote — never the dirty/untracked working tree), else `origin/main..HEAD`
 * for a branch with no upstream configured yet.
 *
 * @param {boolean} hasPushUpstream
 * @returns {string}
 */
export function resolvePushDiffRange(hasPushUpstream) {
  return hasPushUpstream ? '@{push}..HEAD' : 'origin/main..HEAD'
}

/**
 * Parses `git diff --name-only <range>` output into a clean path list.
 *
 * @param {string} diffOutput
 * @returns {string[]}
 */
export function parseDiffOutput(diffOutput) {
  return diffOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * Keeps only `.ts`/`.tsx` paths that still exist on disk — a file renamed
 * or deleted within the pushed range has nothing left to type-check/relate.
 *
 * @param {string[]} paths
 * @param {(path: string) => boolean} existsFn
 * @returns {string[]}
 */
export function filterToExistingTsFiles(paths, existsFn) {
  return paths.filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && existsFn(path))
}
