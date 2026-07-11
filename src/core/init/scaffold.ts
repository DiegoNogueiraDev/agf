/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ScaffoldChange {
  readonly path: string
  readonly action: 'created' | 'patched' | 'skipped-existing' | 'skipped-noop'
  readonly bytes: number
}

export interface ScaffoldResult {
  readonly changes: readonly ScaffoldChange[]
  readonly samplePrdPath: string
  readonly workflowGraphDir: string
}

const GITIGNORE_LINES = ['# mcp-graph workflow', 'workflow-graph/', '.mcp-graph-cache/']

const SAMPLE_PRD_BODY = `# Sample PRD — Hello mcp-graph

## Goals
- Verify the install works end-to-end.
- Show one task moving through the lifecycle.

## Acceptance criteria
- [ ] \`mcp-graph next\` prints a task card.
- [ ] \`mcp-graph start\` and \`mcp-graph finish\` close the loop.
- [ ] Dashboard at http://localhost:3000 shows the graph.

## Tasks
- [task] Read this file (1 minute) — confirms PRD import worked.
- [task] Run \`mcp-graph ui\` and look around (2 minutes).
- [task] Run \`mcp-graph demo\` for a richer tour (3 minutes).
`

export function scaffoldProject(cwd: string, opts: { force?: boolean; graphOnly?: boolean } = {}): ScaffoldResult {
  const changes: ScaffoldChange[] = []
  const workflowGraphDir = join(cwd, 'workflow-graph')
  changes.push(ensureWorkflowGraphDir(workflowGraphDir))
  changes.push(patchGitignore(cwd, opts.force ?? false))

  // graphOnly: the leanest possible footprint on a foreign repo — the graph dir +
  // gitignore entry only, NO sample PRD written into someone else's tree.
  const samplePrdPath = join(cwd, 'PRD.md')
  if (!opts.graphOnly) {
    changes.push(writeSamplePrd(samplePrdPath, opts.force ?? false))
  }

  return { changes, samplePrdPath, workflowGraphDir }
}

function ensureWorkflowGraphDir(dir: string): ScaffoldChange {
  if (existsSync(dir)) {
    return { path: dir, action: 'skipped-existing', bytes: 0 }
  }
  mkdirSync(dir, { recursive: true })
  return { path: dir, action: 'created', bytes: 0 }
}

function patchGitignore(cwd: string, _force: boolean): ScaffoldChange {
  const gitignore = join(cwd, '.gitignore')
  const exists = existsSync(gitignore)
  const current = exists ? readFileSync(gitignore, 'utf8') : ''

  const missing = GITIGNORE_LINES.filter((line) => !current.split('\n').some((l) => l.trim() === line.trim()))

  if (missing.length === 0) {
    return { path: gitignore, action: 'skipped-noop', bytes: current.length }
  }

  const trailer = current.length > 0 && !current.endsWith('\n') ? '\n' : ''
  const next = `${current}${trailer}${missing.join('\n')}\n`
  writeFileSync(gitignore, next, 'utf8')
  return {
    path: gitignore,
    action: exists ? 'patched' : 'created',
    bytes: next.length,
  }
}

function writeSamplePrd(path: string, force: boolean): ScaffoldChange {
  if (existsSync(path) && !force) {
    return { path, action: 'skipped-existing', bytes: 0 }
  }
  writeFileSync(path, SAMPLE_PRD_BODY, 'utf8')
  return { path, action: 'created', bytes: SAMPLE_PRD_BODY.length }
}
