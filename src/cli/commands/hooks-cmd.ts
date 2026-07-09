/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 3.3) — CLI `agf hooks` (list/test/discover).
 * Superfície de inspeção da taxonomia de 28 hooks. Zero-MCP.
 */

import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { getSharedHookBus } from '../../core/hooks/shared-hook-bus.js'
import { registeredHookCount, getHandlerStats } from '../../core/hooks/register-hook.js'
import {
  HOOK_TAXONOMY,
  HOOK_TAXONOMY_POINTS,
  assertHookChannel,
  type HookChannel,
  type HookTaxonomyPoint,
} from '../../core/hooks/hook-types.js'
import { HOOK_CAPABILITY_REGISTRY } from '../../core/hooks/hook-capability-registry.js'
import { addHookEntry, validateHookChannel, mergeImportedHooksIntoConfig } from './hooks-add.js'
import { generateShellHooks } from '../../core/cli-provider/shell-hook-provider.js'
import { AgentSourceSchema } from '../../core/hooks/config-loader.js'
import { ToolLifecycleHooks } from '../../core/hooks/tool-lifecycle-hooks.js'
import { ToolHookEventSchema } from '../../schemas/tool-hook.schema.js'
import type { ToolHookEvent, HookResult } from '../../schemas/tool-hook.schema.js'
import { importClaudeCodeSettings } from '../../core/hooks/claude-code-importer.js'
import { importAiderSettings } from '../../core/hooks/providers/aider.js'
import { importClineSettings } from '../../core/hooks/providers/cline.js'
import { importCodexSettings } from '../../core/hooks/providers/codex.js'
import { importContinueSettings } from '../../core/hooks/providers/continue.js'
import { importCopilotSettings } from '../../core/hooks/providers/copilot.js'
import { importCursorRules } from '../../core/hooks/providers/cursor.js'
import { writeMemory } from '../../core/memory/memory-reader.js'
import { importOpenCodeSettings } from '../../core/hooks/providers/opencode.js'
import {
  installHooks,
  uninstallHooks,
  listInstalledHooks,
  detectConfigDrift,
  type HookProfile,
} from '../../core/hooks/install.js'

export interface HookListEntry {
  point: HookTaxonomyPoint
  channel: HookChannel
  module: string
  capability: string
}

/** Lista os 28 pontos da taxonomia com canal + módulo-owner. */
export function listHooks(): HookListEntry[] {
  return HOOK_TAXONOMY_POINTS.map((point) => ({
    point,
    channel: HOOK_TAXONOMY[point],
    module: HOOK_CAPABILITY_REGISTRY[point].module,
    capability: HOOK_CAPABILITY_REGISTRY[point].capability,
  }))
}

/** Canais (resolvidos) da taxonomia sem nenhum handler registrado via registerHook. */
export function discoverUnhandled(): HookChannel[] {
  const channels = new Set<HookChannel>(HOOK_TAXONOMY_POINTS.map((p) => HOOK_TAXONOMY[p]))
  return [...channels].filter((ch) => registeredHookCount(ch) === 0)
}

export interface TestHookResult {
  channel: HookChannel
  handlersFired: number
}

/** Dry-fire de um canal com um payload de fixture. Retorna quantos handlers existiam. */
export function testHook(channel: string): TestHookResult {
  const ch = assertHookChannel(channel)
  const bus = getSharedHookBus()
  const handlersFired = bus.listenerCount(ch)
  bus.emitSync({ channel: ch, timestamp: new Date().toISOString(), payload: { _fixture: true } })
  return { channel: ch, handlersFired }
}

export interface ToolHookTestResult extends HookResult {
  tool: string
  event: ToolHookEvent
}

/**
 * Dry-fires a single per-tool lifecycle hook (PreToolUse/PostToolUse/PostToolUseFailure)
 * against a fixture payload. Registers exactly the one hook under test so the result
 * reflects that hook's allow/deny/updatedInput decision in isolation.
 */
export async function runToolHookTest(opts: {
  tool: string
  event: string
  command: string
}): Promise<ToolHookTestResult> {
  const event = ToolHookEventSchema.parse(opts.event)
  const hooks = new ToolLifecycleHooks()
  hooks.register({ tool: opts.tool, event, command: opts.command, timeoutMs: 5000 })

  let result: HookResult
  if (event === 'PreToolUse') {
    result = await hooks.runPreToolUse(opts.tool, { _fixture: true })
  } else if (event === 'PostToolUse') {
    result = await hooks.runPostToolUse(opts.tool, { _fixture: true })
  } else {
    await hooks.runPostToolUseFailure(opts.tool, new Error('fixture'))
    result = { allow: true }
  }

  return { ...result, tool: opts.tool, event }
}

/** Builds the `agf hooks` CLI command (Commander definition). */
export function hooksCommand(): Command {
  const cmd = new Command('hooks').description('Inspeciona a taxonomia de 28 hooks (list/test/discover)')

  cmd
    .command('list')
    .description('Lista os 28 pontos da taxonomia: ponto → canal → módulo-owner')
    .action(() => {
      const out = createCliOutput('hooks.list')
      const hooks = listHooks()
      out.ok({ hooks }, { count: hooks.length })
    })

  cmd
    .command('test')
    .description('Dry-fire de um canal com payload de fixture')
    .argument('<channel>', 'Canal do hook (ex.: llm:pre-call)')
    .action((channel: string) => {
      const out = createCliOutput('hooks.test')
      try {
        out.ok(testHook(channel))
      } catch (err) {
        out.err('NOT_FOUND', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('tool-test')
    .description(
      'Dry-fire a per-tool lifecycle hook (PreToolUse/PostToolUse/PostToolUseFailure) against a fixture payload',
    )
    .requiredOption('--tool <tool>', "Tool name or '*' for all tools")
    .requiredOption('--event <event>', 'PreToolUse | PostToolUse | PostToolUseFailure')
    .requiredOption('--command <command>', 'Shell command executed with JSON via stdin')
    .action(async (opts: { tool: string; event: string; command: string }) => {
      const out = createCliOutput('hooks.tool-test')
      try {
        out.ok(await runToolHookTest(opts))
      } catch (err) {
        out.err('INVALID_EVENT', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('stats')
    .description('Handler call stats: count, p50/p95 duration, error count, last error, circuit state')
    .action(() => {
      const out = createCliOutput('hooks.stats')
      const stats = getHandlerStats()
      out.ok({ stats }, { count: stats.length })
    })

  cmd
    .command('discover')
    .description('Lista canais da taxonomia sem handler registrado')
    .action(() => {
      const out = createCliOutput('hooks.discover')
      const unhandled = discoverUnhandled()
      out.ok({ unhandled }, { count: unhandled.length })
    })

  cmd
    .command('add')
    .description('Scaffolds a hook entry into .mcp-graph/hooks.json')
    .requiredOption('--channel <channel>', 'Hook channel (e.g. tool:pre-call)')
    .requiredOption('--command <command>', 'Shell command to run')
    .option('--user', 'Write to user config (~/.mcp-graph/hooks.json) instead of project')
    .option('--emit <cli>', 'Also emit native snippet for cli (codex|opencode|copilot)')
    .option('--description <text>', 'Optional description for the hook entry')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(
      (opts: {
        channel: string
        command: string
        user?: boolean
        emit?: string
        description?: string
        dir: string
      }) => {
        const out = createCliOutput('hooks.add')
        try {
          validateHookChannel(opts.channel)
          const result = addHookEntry({
            channel: opts.channel,
            command: opts.command,
            dir: opts.dir,
            scope: opts.user ? 'user' : 'project',
            emit: opts.emit,
            description: opts.description,
          })
          out.ok(result)
        } catch (err) {
          out.err('INVALID_CHANNEL', err instanceof Error ? err.message : String(err))
        }
      },
    )

  cmd
    .command('add-shell')
    .description(
      'Generate default shell hooks (agf hook <sub>) for CLIs without native hook support, merged into hooks.json',
    )
    .option('--cli-path <path>', 'Path to the agf binary invoked by generated hooks', 'agf')
    .option(
      '--channels <channels>',
      'Comma-separated hook channels (default: session:start,session:end,tool:pre-call,tool:post-call)',
    )
    .option('--agent-source <source>', 'Agent source to attribute generated hooks to', 'mcp-graph')
    .option('--user', 'Write to user config (~/.mcp-graph/hooks.json) instead of project')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { cliPath: string; channels?: string; agentSource: string; user?: boolean; dir: string }) => {
      const out = createCliOutput('hooks.add-shell')
      const parsedSource = AgentSourceSchema.safeParse(opts.agentSource)
      if (!parsedSource.success) {
        out.err('INVALID_AGENT_SOURCE', `Unknown --agent-source "${opts.agentSource}"`)
        return
      }
      try {
        const channels = opts.channels ? opts.channels.split(',').map((c) => assertHookChannel(c.trim())) : undefined
        const generated = generateShellHooks({
          cliPath: opts.cliPath,
          channels,
          agentSource: parsedSource.data,
        })
        const result = mergeImportedHooksIntoConfig({
          entries: generated.handlers,
          dir: opts.dir,
          scope: opts.user ? 'user' : 'project',
        })
        out.ok({ ...result, generated: generated.handlers.length, provider: generated.provider })
      } catch (err) {
        out.err('INVALID_CHANNEL', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('import-claude-code')
    .description('Import ~/.claude/settings.json hook blocks into .mcp-graph/hooks.json')
    .option('--source <path>', 'Override the default ~/.claude/settings.json path')
    .option('--user', 'Write to user config (~/.mcp-graph/hooks.json) instead of project')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { source?: string; user?: boolean; dir: string }) => {
      const out = createCliOutput('hooks.import-claude-code')
      const envelope = importClaudeCodeSettings({ source: opts.source })
      const result = mergeImportedHooksIntoConfig({
        entries: envelope.imported,
        dir: opts.dir,
        scope: opts.user ? 'user' : 'project',
      })
      out.ok({
        ...result,
        imported: envelope.imported.length,
        skipped: envelope.skipped,
        source: envelope.source,
      })
    })

  cmd
    .command('import-aider')
    .description('Import .aider.conf.yml (lint-cmd/test-cmd) hook blocks into .mcp-graph/hooks.json')
    .option('--source <path>', 'Override the default .aider.conf.yml path')
    .option('--user', 'Write to user config (~/.mcp-graph/hooks.json) instead of project')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { source?: string; user?: boolean; dir: string }) => {
      const out = createCliOutput('hooks.import-aider')
      const envelope = importAiderSettings({ source: opts.source })
      const result = mergeImportedHooksIntoConfig({
        entries: envelope.imported,
        dir: opts.dir,
        scope: opts.user ? 'user' : 'project',
      })
      out.ok({
        ...result,
        imported: envelope.imported.length,
        skipped: envelope.skipped,
        source: envelope.source,
      })
    })

  cmd
    .command('import-cline')
    .description(
      'Report Cline (VS Code) MCP servers configured in the user settings.json — no hook lifecycle to import',
    )
    .option('--source <path>', 'Override the default VS Code settings.json path')
    .action((opts: { source?: string }) => {
      const out = createCliOutput('hooks.import-cline')
      const result = importClineSettings({ source: opts.source })
      out.ok({
        imported: result.imported.length,
        skipped: result.skipped,
        source: result.source,
        mcpServers: result.mcpServers,
      })
    })

  cmd
    .command('import-codex')
    .description('Import ~/.codex/config.toml [hooks] blocks into .mcp-graph/hooks.json')
    .option('--source <path>', 'Override the default ~/.codex/config.toml path')
    .option('--user', 'Write to user config (~/.mcp-graph/hooks.json) instead of project')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { source?: string; user?: boolean; dir: string }) => {
      const out = createCliOutput('hooks.import-codex')
      const envelope = importCodexSettings({ source: opts.source })
      const result = mergeImportedHooksIntoConfig({
        entries: envelope.imported,
        dir: opts.dir,
        scope: opts.user ? 'user' : 'project',
      })
      out.ok({
        ...result,
        imported: envelope.imported.length,
        skipped: envelope.skipped,
        source: envelope.source,
      })
    })

  cmd
    .command('import-continue')
    .description('Report Continue.dev MCP servers configured in ~/.continue/config.json — no hook lifecycle to import')
    .option('--source <path>', 'Override the default ~/.continue/config.json path')
    .action((opts: { source?: string }) => {
      const out = createCliOutput('hooks.import-continue')
      const result = importContinueSettings({ source: opts.source })
      out.ok({
        imported: result.imported.length,
        skipped: result.skipped,
        source: result.source,
        mcpServers: result.mcpServers,
      })
    })

  cmd
    .command('import-copilot')
    .description('Import .github/hooks/*.{json,toml} blocks into .mcp-graph/hooks.json')
    .option('--source <path>', 'Override the default .github/hooks/ directory path')
    .option('--user', 'Write to user config (~/.mcp-graph/hooks.json) instead of project')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { source?: string; user?: boolean; dir: string }) => {
      const out = createCliOutput('hooks.import-copilot')
      const envelope = importCopilotSettings({ source: opts.source })
      const result = mergeImportedHooksIntoConfig({
        entries: envelope.imported,
        dir: opts.dir,
        scope: opts.user ? 'user' : 'project',
      })
      out.ok({
        ...result,
        imported: envelope.imported.length,
        skipped: envelope.skipped,
        source: envelope.source,
      })
    })

  cmd
    .command('import-cursor')
    .description('Persist .cursor/rules content as a project memory (cursor-rules) so it surfaces in RAG search')
    .option('--source <path>', 'Override the default .cursor/rules path')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(async (opts: { source?: string; dir: string }) => {
      const out = createCliOutput('hooks.import-cursor')
      const result = importCursorRules({ source: opts.source })
      if (result.rulesText === null) {
        out.ok({ imported: 0, source: result.source, memoryName: null })
        return
      }
      await writeMemory(opts.dir, 'cursor-rules', result.rulesText)
      out.ok({ imported: 1, source: result.source, memoryName: 'cursor-rules' })
    })

  cmd
    .command('install')
    .description('Install mcp-graph hooks into .claude/settings.local.json (SessionStart/PreToolUse/PostToolUse/Stop)')
    .option('--profile <profile>', 'minimal | balanced | aggressive', 'balanced')
    .option('--dry-run', 'Report the change without writing the file')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { profile: string; dryRun?: boolean; dir: string }) => {
      const out = createCliOutput('hooks.install')
      const profile = opts.profile as HookProfile
      if (profile !== 'minimal' && profile !== 'balanced' && profile !== 'aggressive') {
        out.err('INVALID_PROFILE', `Unknown --profile "${opts.profile}" — expected minimal|balanced|aggressive`)
        return
      }
      const result = installHooks(opts.dir, { profile, dryRun: opts.dryRun })
      out.ok(result)
    })

  cmd
    .command('uninstall')
    .description('Remove mcp-graph hooks from .claude/settings.local.json, leaving other hooks untouched')
    .option('--dry-run', 'Report the change without writing the file')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dryRun?: boolean; dir: string }) => {
      const out = createCliOutput('hooks.uninstall')
      const result = uninstallHooks(opts.dir, { dryRun: opts.dryRun })
      out.ok(result)
    })

  cmd
    .command('status')
    .description('Show installed mcp-graph hooks + config drift vs the current installer version')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('hooks.status')
      const installed = listInstalledHooks(opts.dir)
      const drift = detectConfigDrift(opts.dir)
      out.ok({ installed, drift }, { count: installed.length })
    })

  cmd
    .command('import-opencode')
    .description('Import ~/.config/opencode/config.toml [hooks] blocks into .mcp-graph/hooks.json')
    .option('--source <path>', 'Override the default ~/.config/opencode/config.toml path')
    .option('--user', 'Write to user config (~/.mcp-graph/hooks.json) instead of project')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { source?: string; user?: boolean; dir: string }) => {
      const out = createCliOutput('hooks.import-opencode')
      const envelope = importOpenCodeSettings({ source: opts.source })
      const result = mergeImportedHooksIntoConfig({
        entries: envelope.imported,
        dir: opts.dir,
        scope: opts.user ? 'user' : 'project',
      })
      out.ok({
        ...result,
        imported: envelope.imported.length,
        skipped: envelope.skipped,
        source: envelope.source,
        pluginsDiscovered: envelope.pluginsDiscovered,
      })
    })

  return cmd
}
