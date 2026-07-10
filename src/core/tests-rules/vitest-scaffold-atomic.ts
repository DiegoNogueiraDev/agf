/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Vitest-specific scaffold for mcp-graph init.
 * Generates vitest.smoke.config.ts and merges test:blast/smoke scripts
 * into package.json — only when vitest is detected as a dependency.
 */

import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { WriteResult } from '../atomic-files/types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tests-rules/vitest-scaffold-atomic.ts' })

const VITEST_SMOKE_CONFIG = `import { defineConfig } from "vitest/config";

// Smoke suite: critical-path tests, fast (<5s each), no heavy I/O.
// Add to smoke set:  ln -sf ../<test>.test.ts src/tests/smoke/<test>.test.ts
// Remove from smoke: rm src/tests/smoke/<test>.test.ts
// Target runtime: <30s total.
export default defineConfig({
  test: {
    include: ["src/tests/smoke/**/*.test.ts"],
    pool: "forks",
    testTimeout: 5_000,
    globals: true,
  },
});
`

const BLAST_SCRIPTS: Record<string, string> = {
  'test:blast': 'vitest run --changed HEAD --project=node',
  'test:blast:full': 'vitest run --changed HEAD',
  'test:node': 'vitest run --project=node',
  'test:smoke': 'vitest run --config vitest.smoke.config.ts',
  'test:clear': 'vitest --clearCache',
}

/** Returns true when the target project has vitest in dependencies or devDependencies. */
export function hasVitest(projectDir: string): boolean {
  const pkgPath = join(projectDir, 'package.json')
  if (!existsSync(pkgPath)) return false
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
    const deps = {
      ...((pkg.dependencies ?? {}) as Record<string, string>),
      ...((pkg.devDependencies ?? {}) as Record<string, string>),
    }
    return 'vitest' in deps
  } catch {
    return false
  }
}

/** Creates vitest.smoke.config.ts in projectDir if vitest is detected and the file doesn't exist yet. */
export async function initVitestSmokeConfig(projectDir: string): Promise<WriteResult> {
  log.debug('vitest-scaffold:initVitestSmokeConfig', { projectDir })
  if (!hasVitest(projectDir)) return { status: 'noop' }
  const filePath = join(projectDir, 'vitest.smoke.config.ts')
  if (existsSync(filePath)) return { status: 'noop' }
  writeFileSync(filePath, VITEST_SMOKE_CONFIG, 'utf-8')
  return { status: 'created' }
}

/** Merges test:blast/smoke/node/clear scripts into package.json without overwriting existing scripts. */
export async function mergeVitestScripts(projectDir: string): Promise<WriteResult> {
  log.debug('vitest-scaffold:mergeVitestScripts', { projectDir })
  if (!hasVitest(projectDir)) return { status: 'noop' }
  const pkgPath = join(projectDir, 'package.json')
  if (!existsSync(pkgPath)) return { status: 'noop' }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
  const scripts = (pkg.scripts ?? {}) as Record<string, string>

  let changed = false
  for (const [key, val] of Object.entries(BLAST_SCRIPTS)) {
    if (!(key in scripts)) {
      scripts[key] = val
      changed = true
    }
  }
  if (!changed) return { status: 'noop' }

  pkg.scripts = scripts
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  return { status: 'updated' }
}
