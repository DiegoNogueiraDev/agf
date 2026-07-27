/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readFileSync, writeFileSync, chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { HookChannel } from '../hook-types.js'
import type { HookHandlerConfig } from '../config-loader.js'
import { readSettingsFile, generateHandlerId, type ImportEnvelope } from '../import-helpers.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'aider.ts' })

/**
 * Sprint M5 (Multi-CLI PRD) — Aider provider.
 *
 * Aider has no first-class hook lifecycle. Two integration vectors:
 *  1. `.aider.conf.yml` — config keys like `lint-cmd`, `test-cmd`,
 *     `auto-commits` map to mcp-graph hook handlers (kind=shell).
 *  2. Git hook generator — installs `.git/hooks/{pre-commit,pre-push}`
 *     that invoke `mcp-graph hook fire`. --dry-run is the default;
 *     --apply requires explicit opt-in and creates `.bak` backups.
 */

export const aiderAliases: Record<string, HookChannel | null> = {
  'lint-cmd': 'tool:post-call',
  'test-cmd': 'task:post-complete',
}

interface AiderConfig {
  'lint-cmd'?: string | string[]
  'test-cmd'?: string | string[]
  'auto-commits'?: boolean
}

export interface AiderImportOptions {
  source?: string
}

/** importAiderSettings —  */
export function importAiderSettings(opts: AiderImportOptions = {}): ImportEnvelope {
  const source = opts.source ?? join(process.cwd(), '.aider.conf.yml')
  const file = readSettingsFile<AiderConfig>(source, 'yaml')
  if (!file.ok) {
    return { imported: [], skipped: [{ event: '*', reason: file.reason }], source, provider: 'aider' }
  }

  const imported: HookHandlerConfig[] = []
  const skipped: ImportEnvelope['skipped'] = []
  let idx = 0

  for (const [key, channel] of Object.entries(aiderAliases)) {
    const raw = file.data[key as keyof AiderConfig]
    if (channel == null || raw === undefined) {
      if (raw !== undefined) skipped.push({ event: key, reason: 'no mcp-graph analog' })
      continue
    }
    const commands = Array.isArray(raw) ? raw : [raw as string]
    for (const command of commands) {
      if (typeof command !== 'string' || command.length === 0) {
        skipped.push({ event: key, reason: 'empty command' })
        continue
      }
      imported.push({
        id: generateHandlerId('aider', key, idx, 0),
        channel,
        kind: 'shell',
        command: '/bin/sh',
        commandArgs: ['-c', command],
        timeoutMs: 30_000, // lint/test commands run longer than 5s default
        priority: 0,
        enabled: true,
        description: `Imported from Aider config ${key}`,
        agentSource: 'aider',
      })
      idx++
    }
  }

  if (file.data['auto-commits']) {
    skipped.push({ event: 'auto-commits', reason: 'no analog — handled via git hooks (M5.2)' })
  }

  log.info('hooks:import:done', {
    provider: 'aider',
    source,
    imported: imported.length,
    skipped: skipped.length,
  })
  return { imported, skipped, source, provider: 'aider' }
}

// ── M5.2 — git-hook script generator ────────────────────────────

const MARKER_BEGIN = '# >>> mcp-graph hooks (managed) >>>'
const MARKER_END = '# <<< mcp-graph hooks (managed) <<<'

const HOOK_SNIPPETS = {
  'pre-commit': `${MARKER_BEGIN}
mcp-graph hook fire --channel task:pre-execute --agent-source aider --payload "$(git diff --cached --name-only)" || true
${MARKER_END}`,
  'pre-push': `${MARKER_BEGIN}
mcp-graph hook fire --channel task:post-complete --agent-source aider --payload "$(git log -1 --format=%H)" || true
${MARKER_END}`,
}

export interface InstallAiderBridgeOptions {
  basePath: string
  /** When false (default), only prints what would be written. */
  apply?: boolean
  /** Override list of hooks to install. */
  hooks?: Array<keyof typeof HOOK_SNIPPETS>
}

export interface InstallAiderBridgeResult {
  applied: boolean
  changes: Array<{ hookPath: string; action: 'create' | 'append' | 'skip-already-installed'; backupPath?: string }>
  dryRun: boolean
}

/** installAiderBridge —  */
export function installAiderBridge(opts: InstallAiderBridgeOptions): InstallAiderBridgeResult {
  const dryRun = !opts.apply
  const hooksDir = join(opts.basePath, '.git', 'hooks')
  const hookNames = opts.hooks ?? (Object.keys(HOOK_SNIPPETS) as Array<keyof typeof HOOK_SNIPPETS>)
  const resultValue: InstallAiderBridgeResult = { applied: !dryRun, changes: [], dryRun }

  if (!existsSync(join(opts.basePath, '.git'))) {
    log.warn('hooks:aider:no-git', { basePath: opts.basePath })
    return resultValue
  }
  if (!dryRun) mkdirSync(hooksDir, { recursive: true })

  for (const hookName of hookNames) {
    const hookPath = join(hooksDir, hookName)
    const snippet = HOOK_SNIPPETS[hookName]
    const existing = existsSync(hookPath) ? readFileSync(hookPath, 'utf-8') : ''

    if (existing.includes(MARKER_BEGIN)) {
      resultValue.changes.push({ hookPath, action: 'skip-already-installed' })
      continue
    }

    if (dryRun) {
      const action: 'create' | 'append' = existing.length === 0 ? 'create' : 'append'
      resultValue.changes.push({ hookPath, action })
      log.info('hooks:aider:dry-run', { hookPath, action, snippet })
      continue
    }

    let backupPath: string | undefined
    if (existing.length > 0) {
      backupPath = `${hookPath}.bak`
      copyFileSync(hookPath, backupPath)
    }

    const next = existing.length === 0 ? `#!/bin/sh\n${snippet}\n` : appendWithChain(existing, snippet)
    writeFileSync(hookPath, next, 'utf-8')
    chmodSync(hookPath, 0o755)
    resultValue.changes.push({
      hookPath,
      action: existing.length === 0 ? 'create' : 'append',
      backupPath,
    })
  }

  return resultValue
}

function appendWithChain(existing: string, snippet: string): string {
  const trimmed = existing.endsWith('\n') ? existing : existing + '\n'
  return `${trimmed}${snippet}\n`
}
