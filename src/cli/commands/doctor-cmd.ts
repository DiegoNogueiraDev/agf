/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { runDoctor } from '../../core/doctor/doctor-runner.js'
import { runSelfCheck } from '../../core/doctor/self-check.js'
import { checkProviders } from '../../core/doctor/provider-check.js'
import { installAllMcpDeps } from '../../core/integrations/mcp-deps-installer.js'
import { buildMcpServersConfig } from '../../core/integrations/mcp-servers-config.js'
import { runSentruxGate, type GateBaseline } from '../../core/integrations/sentrux-gate.js'
import { SentruxMcpAdapter } from '../../core/integrations/sentrux-mcp-adapter.js'
import { MemoryGuard, HEAVY_TOOLS } from '../../core/utils/memory-guard.js'
import { buildMemoryHealthReport } from '../../core/utils/memory-telemetry.js'
import { ConcurrentSemaphore, MAX_CONCURRENT_HEAVY, QUEUE_TIMEOUT_MS } from '../../core/utils/concurrent-semaphore.js'
import { pingAllProviders } from '../../core/doctor/provider-ping.js'
import { selectProvider } from '../../core/model-hub/resolve-provider.js'
import { responseCacheEnabled } from '../../core/model-hub/caching-model-adapter.js'
import { resolveFailoverSpecs } from '../shared/provider-context.js'
import { ocrMode } from '../../core/intake/ocr.js'
import { runSyntheticValidation } from '../../core/harness/synthetic-validation-gate.js'
import { checkConfigs } from '../../core/init/sync-configs.js'
import { openStoreIfExists, openStoreOrFail } from '../open-store.js'
import { resolveStorePath } from '../../core/store/path-resolver.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import type { CheckResult } from '../../core/doctor/doctor-types.js'

const log = createLogger({ layer: 'cli', source: 'doctor.ts' })

function activeLlmContext(dir: string) {
  const store = openStoreIfExists(dir)
  try {
    const setting = store?.getProjectSetting('provider') ?? process.env.AGF_PROVIDER ?? null
    const baseUrl = store?.getProjectSetting('provider_base_url') ?? undefined
    const model = store?.getProjectSetting('model') ?? 'auto'
    const choice = selectProvider(setting, process.env, baseUrl)
    const result: Record<string, unknown> = {
      model,
      responseCache: responseCacheEnabled() ? 'on' : 'off',
    }
    if (choice.kind === 'copilot') {
      result.provider = 'copilot'
      if (setting && setting !== 'copilot')
        result.fallbackReason = `setting='${setting}' sem chave → fallback p/ copilot`
    } else {
      result.provider = choice.providerId
      result.baseURL = choice.baseURL
    }
    const failover = resolveFailoverSpecs(store ?? undefined, process.env)
    if (failover.length > 0) {
      result.failover = failover.map((s) => (s.model ? `${s.provider}:${s.model}` : s.provider))
    }
    result.ocr = ocrMode()
    return result
  } finally {
    store?.close()
  }
}

/** Builds the `agf doctor` CLI command (Commander definition). */
export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Validate the execution environment')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--providers', 'Report LLM provider credential configuration')
    .option('--no-ping', 'Skip real-network ping check when using --providers')
    .option('--mcp-deps', 'Report availability of MCP runtime dependencies (npx, uvx, docker)')
    .option('--mcp-config', 'Print the mcpServers block for opt-in wiring into your own MCP client config')
    .option('--self-check', 'Install-health golden path: db/providers/git/node with PASS/FAIL verdict + fix commands')
    .option(
      '--graph-invariants',
      "Mutation-test the graph's own consistency checks (inject dangling edges/status regressions/cycles, verify they get caught)",
    )
    .option(
      '--config-sync',
      'Report drift between the project and the CLI-emitted config files (.claude/settings.local.json, CLAUDE.md)',
    )
    .option('--store', 'Report which graph database (local/global/explicit) would be resolved for this dir, and why')
    .option(
      '--sentrux-gate <currentFile>',
      'Compare .sentrux/baseline.json against a current Sentrux snapshot file; fails on quality regression',
    )
    .option(
      '--sentrux-mcp-health <snapshotFile>',
      'Validate a captured Sentrux MCP health tool response against its schema',
    )
    .option(
      '--heavy-tool <name>',
      'Check whether MemoryGuard would reject a heavy tool call under current process memory pressure',
    )
    .option('--warn-threshold-mb <n>', 'MemoryGuard warn threshold in MB for --heavy-tool (default: 600)')
    .option('--reject-threshold-mb <n>', 'MemoryGuard reject threshold in MB for --heavy-tool (default: 800)')
    .option(
      '--concurrency-status <name>',
      'Check whether ConcurrentSemaphore would admit a heavy tool call under the configured concurrency limits',
    )
    .option(
      '--max-concurrent <n>',
      `ConcurrentSemaphore max concurrent heavy tools for --concurrency-status (default: ${MAX_CONCURRENT_HEAVY})`,
    )
    .option('--max-queued <n>', 'ConcurrentSemaphore max queued waiters for --concurrency-status (default: unbounded)')
    .option(
      '--memory-health',
      'Report current heap health (buildMemoryHealthReport) — usage, pressure level, recommendations',
    )
    .action(
      async (opts: {
        dir: string
        providers: boolean
        ping: boolean
        store?: boolean
        mcpDeps?: boolean
        mcpConfig?: boolean
        selfCheck?: boolean
        graphInvariants?: boolean
        configSync?: boolean
        sentruxGate?: string
        sentruxMcpHealth?: string
        heavyTool?: string
        warnThresholdMb?: string
        rejectThresholdMb?: string
        concurrencyStatus?: string
        maxConcurrent?: string
        maxQueued?: string
        memoryHealth?: boolean
      }) => {
        const out = createCliOutput('doctor')
        try {
          if (opts.configSync) {
            out.ok(checkConfigs(opts.dir))
            return
          }

          if (opts.store) {
            try {
              const resolved = resolveStorePath({ cwd: opts.dir, explicitDb: process.env.MCP_GRAPH_DB })
              out.ok({ mode: resolved.mode, dbPath: resolved.dbPath, memoriesPath: resolved.memoriesPath })
            } catch (err) {
              out.fail('STORE_NOT_FOUND', getErrorMessage(err), { dir: opts.dir })
            }
            return
          }

          if (opts.memoryHealth) {
            const report = buildMemoryHealthReport({
              warnThresholdMb: opts.warnThresholdMb ? Number(opts.warnThresholdMb) : undefined,
              rejectThresholdMb: opts.rejectThresholdMb ? Number(opts.rejectThresholdMb) : undefined,
            })
            out.ok(report)
            return
          }

          if (opts.heavyTool) {
            const guard = new MemoryGuard({
              warnThresholdMb: opts.warnThresholdMb ? Number(opts.warnThresholdMb) : undefined,
              rejectThresholdMb: opts.rejectThresholdMb ? Number(opts.rejectThresholdMb) : undefined,
            })
            const isHeavyTool = HEAVY_TOOLS.includes(opts.heavyTool)
            const rejection = guard.checkForTool(opts.heavyTool)
            const snapshot = guard.snapshot()
            const data = {
              tool: opts.heavyTool,
              isHeavyTool,
              pressureLevel: snapshot.level,
              heapMb: Math.round(snapshot.heapUsedMb),
              rejected: rejection !== null,
            }
            if (rejection) {
              out.fail('MEMORY_PRESSURE_REJECTED', rejection.content[0]?.text ?? 'Memory pressure rejected', data)
            } else {
              out.ok(data)
            }
            return
          }

          if (opts.concurrencyStatus) {
            const maxConcurrent = opts.maxConcurrent ? Number(opts.maxConcurrent) : MAX_CONCURRENT_HEAVY
            const maxQueued = opts.maxQueued ? Number(opts.maxQueued) : Infinity
            const semaphore = new ConcurrentSemaphore(maxConcurrent, QUEUE_TIMEOUT_MS, maxQueued)
            const isHeavyTool = HEAVY_TOOLS.includes(opts.concurrencyStatus)
            const rejection = semaphore.checkForTool(opts.concurrencyStatus)
            const data = {
              tool: opts.concurrencyStatus,
              isHeavyTool,
              maxConcurrent,
              active: semaphore.active,
              queued: semaphore.queued,
              rejected: rejection !== null,
            }
            if (rejection) {
              out.fail('CONCURRENCY_LIMIT_REJECTED', rejection.content[0]?.text ?? 'Concurrency limit rejected', data)
            } else {
              out.ok(data)
            }
            return
          }

          if (opts.sentruxGate) {
            const baselinePath = path.join(opts.dir, '.sentrux', 'baseline.json')
            if (!existsSync(baselinePath)) {
              out.fail('SENTRUX_GATE_NO_BASELINE', `No baseline found at ${baselinePath}`, { baselinePath })
              return
            }
            if (!existsSync(opts.sentruxGate)) {
              out.fail('SENTRUX_GATE_NO_CURRENT', `Current snapshot not found at ${opts.sentruxGate}`, {
                currentPath: opts.sentruxGate,
              })
              return
            }
            const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as GateBaseline
            const current = JSON.parse(readFileSync(opts.sentruxGate, 'utf-8')) as GateBaseline
            const result = runSentruxGate(baseline, current)
            if (result.status === 'pass') {
              out.ok(result)
            } else {
              out.fail('SENTRUX_GATE_REGRESSION', 'Quality gate regression detected', result)
            }
            return
          }

          if (opts.sentruxMcpHealth) {
            if (!existsSync(opts.sentruxMcpHealth)) {
              out.fail('SENTRUX_MCP_HEALTH_NO_FILE', `Snapshot not found at ${opts.sentruxMcpHealth}`, {
                snapshotPath: opts.sentruxMcpHealth,
              })
              return
            }
            const raw = JSON.parse(readFileSync(opts.sentruxMcpHealth, 'utf-8'))
            const adapter = new SentruxMcpAdapter(async () => raw)
            try {
              const result = await adapter.health()
              out.ok(result)
            } catch (err) {
              out.fail('SENTRUX_MCP_HEALTH_INVALID', getErrorMessage(err), { snapshotPath: opts.sentruxMcpHealth })
            }
            return
          }

          if (opts.mcpDeps) {
            const mcpDepsResults = await installAllMcpDeps(opts.dir)
            out.ok({ mcpDeps: mcpDepsResults })
            return
          }

          if (opts.mcpConfig) {
            out.ok({ mcpConfig: buildMcpServersConfig() })
            return
          }

          if (opts.selfCheck) {
            const result = await runSelfCheck(opts.dir)
            if (result.verdict === 'PASS') {
              out.ok(result)
            } else {
              out.fail('SELF_CHECK_FAILED', result.summary, result)
            }
            return
          }

          if (opts.graphInvariants) {
            const store = openStoreOrFail(opts.dir, { requireExisting: true })
            try {
              const result = runSyntheticValidation(store)
              if (result.passed) {
                out.ok(result)
              } else {
                out.fail(
                  'GRAPH_INVARIANTS_FAILED',
                  'A synthetic mutation went undetected by a built-in invariant',
                  result,
                )
              }
            } finally {
              store.close()
            }
            return
          }

          if (opts.providers) {
            const providerReport = checkProviders()
            const llm = activeLlmContext(opts.dir)
            const pingResults = await pingAllProviders(process.env, { noPing: !opts.ping })
            out.ok({ providers: providerReport, llmContext: llm, pingResults })
            return
          }

          const report = await runDoctor(opts.dir)
          // `name` is carried through: without it every check is anonymous, an agent
          // cannot address one with `--select`, and a human cannot tell which probe
          // produced a warning. The runner has always had it; the envelope dropped it.
          const checks = report.checks.map((c: CheckResult) => ({
            name: c.name,
            level: c.level,
            message: c.message,
            suggestion: c.suggestion,
          }))

          if (!report.passed) {
            out.fail('DOCTOR_FAILED', 'Some critical checks failed.', {
              checks,
              summary: report.summary,
            })
          } else {
            out.ok({ checks, summary: report.summary })
          }
        } catch (err) {
          log.error(`Doctor failed: ${getErrorMessage(err)}`)
          out.err('DOCTOR_ERROR', getErrorMessage(err))
        }
      },
    )
}
