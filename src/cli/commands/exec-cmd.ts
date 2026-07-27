/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * `agf exec` — composable command runner. Calls one agf command for each
 * input, or chains multiple agf commands. Equivalent to tool-compress's shell piping
 * but for agf's own JSON output.
 */

import { Command } from 'commander'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createCliOutput } from '../shared/cli-output.js'
import { runAgf } from '../../core/compose/agf-runner.js'
import { openStoreOrFail } from '../open-store.js'
import { trackCommandUsage } from '../../core/observability/cmd-tracker.js'
import { recordInManifest } from '../../core/hooks/session-manifest.js'
import { createLogger } from '../../core/utils/logger.js'
import { retrieveCommand } from '../../core/rag-in/retrieve.js'
import { buildLiveCorpus } from '../../core/rag-in/builtin-corpus.js'
import { CLI_COMMANDS } from '../index.js'

const log = createLogger({ layer: 'cli', source: 'exec-cmd.ts' })

/** Resultado de um step do chain — só o `ok` e o rótulo importam p/ o veredito. */
export interface ChainStepResult {
  command: string
  ok: boolean
  error?: string
}

export interface ChainOutcome {
  ok: boolean
  code?: 'CHAIN_STEP_FAILED'
  error?: string
}

/**
 * Veredito agregado do `exec chain` (node_e3972a535bf6): o envelope EXTERNO só é
 * `ok` se TODOS os sub-comandos foram `ok`. Antes, o chain fazia `out.ok` sempre
 * — um step com `ok:false` (ex.: spawn EACCES em dev) passava despercebido como
 * sucesso. Puro: nomeia os steps que falharam para o driver não confiar num
 * `ok:true` mentiroso.
 */
export function chainOutcome(results: readonly ChainStepResult[]): ChainOutcome {
  const failed = results.filter((r) => !r.ok)
  if (failed.length === 0) return { ok: true }
  return {
    ok: false,
    code: 'CHAIN_STEP_FAILED',
    error: `${failed.length} step(s) falharam: ${failed.map((f) => f.command).join(' | ')}`,
  }
}

/** Builds the `agf exec` CLI command (Commander definition). */
export function execCommand(): Command {
  const cmd = new Command('exec').description('Executa comandos agf em sequência (composição CLI)')

  cmd
    .command('pipe <command> [args...]')
    .description('Executa um comando agf e retorna o resultado JSON')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--track', 'Track command usage for auto-wrapper detection', false)
    .action(async (command: string, args: string[], opts: { dir: string; track?: boolean }) => {
      const out = createCliOutput('exec.pipe')
      const start = Date.now()
      try {
        const result = await runAgf(command, args, { dir: opts.dir })
        if (opts.track) {
          const store = openStoreOrFail(opts.dir)
          try {
            trackCommandUsage(store.getDb(), {
              id: randomUUID(),
              projectId: store.getProject()?.id ?? 'unknown',
              command,
              args: args.join(' '),
              cwd: opts.dir,
              durationMs: Date.now() - start,
              exitCode: 0,
            })
          } finally {
            store.close()
          }
        }
        out.ok(result.envelope.data, { mode: `${command} ${args.join(' ')}` })
      } catch (err) {
        if (opts.track) {
          const store = openStoreOrFail(opts.dir)
          try {
            trackCommandUsage(store.getDb(), {
              id: randomUUID(),
              projectId: store.getProject()?.id ?? 'unknown',
              command,
              args: args.join(' '),
              cwd: opts.dir,
              durationMs: Date.now() - start,
              exitCode: 1,
            })
          } finally {
            store.close()
          }
        }
        out.err('EXEC_FAILED', (err as Error).message)
      }
    })

  cmd
    .command('safe <taskId>')
    .description(
      'Safe Mode (M8): enforced production pipeline — brief→start→blast→check→done.\n' +
        'Each step has mandatory gates: status validation, test pass, DoD, file-modification proof.\n' +
        'Fails fast at the FIRST broken gate — no partial state left behind.',
    )
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--skip-test', 'Skip test run (use for docs-only tasks)', false)
    .option('--retries <n>', 'Max retry attempts per gate on transient failures', (v) => parseInt(v, 10), 1)
    .option('--retry-delay <ms>', 'Base backoff delay in ms between retries', (v) => parseInt(v, 10), 200)
    .action(
      async (taskId: string, opts: { dir: string; skipTest?: boolean; retries?: number; retryDelay?: number }) => {
        const out = createCliOutput('exec.safe')
        const steps: Array<{ name: string; cmd: string; args: string[]; intent: string }> = [
          {
            name: 'brief',
            cmd: 'brief',
            args: [taskId, '--format', 'json'],
            intent: 'generate delegation brief for a task',
          },
          { name: 'start', cmd: 'start', args: [taskId], intent: 'start task and mark in progress' },
          ...(opts.skipTest
            ? []
            : [
                {
                  name: 'blast',
                  cmd: 'test',
                  args: ['--blast'],
                  intent: 'run vitest blast tests for changed files',
                },
              ]),
          {
            name: 'check',
            cmd: 'check',
            args: [taskId],
            intent: 'run definition of done twelve checks and TDD adherence',
          },
          { name: 'done', cmd: 'done', args: [taskId, '--skip-test'], intent: 'mark task done and record memory' },
        ]

        const results: Array<{ step: string; ok: boolean; error?: string }> = []
        const maxAttempts = opts.retries ?? 1
        const baseDelay = opts.retryDelay ?? 200
        // REQ-LCR-001: resolve each step's command via
        // retrieve-command before dispatch — guards against a wrong-command hop in the
        // safe pipeline instead of silently running whatever `step.cmd` says.
        const routingCorpus = buildLiveCorpus(CLI_COMMANDS)

        for (const step of steps) {
          log.debug(`exec.safe:${step.name}`, { cmd: step.cmd, args: step.args, maxAttempts })

          const routing = retrieveCommand(step.intent, routingCorpus)
          const expectedCommand = `agf ${step.cmd}`
          // The check is "does the intent still point at this command", not "is the engine sure".
          // exec already knows the command it wants; retrieval is the cross-check, not the oracle.
          // Requiring `decision === 'retrieved'` made the pipeline hostage to a float: "generate
          // delegation brief for a task" covers two of four concepts, and 0.4999… sits on the
          // wrong side of a 0.5 gate. A wrong-command hop is still caught — that is a mismatched
          // `top`, and it is what this gate exists to refuse.
          if (routing.top?.command !== expectedCommand) {
            results.push({
              step: step.name,
              ok: false,
              error: `Tool-routing miss: expected "${expectedCommand}", retrieve-command resolved "${routing.top?.command ?? 'none'}" (decision=${routing.decision})`,
            })
            out.fail(
              'TOOL_ROUTING_MISS',
              `Tool-routing gate failed for step "${step.name}" (task ${taskId}) — refusing to dispatch.`,
              { taskId, failedStep: step.name, results },
            )
            return
          }

          let lastError: string | undefined

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              const result = await runAgf(step.cmd, step.args, { dir: opts.dir })
              if (result.envelope.ok) {
                lastError = undefined
                break
              }
              lastError = `Gate "${step.name}" returned ok=false`
              if (attempt < maxAttempts - 1) {
                const delay = baseDelay * Math.pow(2, attempt)
                log.info(`exec.safe:${step.name}:retry`, { attempt: attempt + 1, maxAttempts, delayMs: delay })
                await new Promise((r) => setTimeout(r, delay))
              }
            } catch (err) {
              lastError = (err as Error).message
              if (attempt < maxAttempts - 1) {
                const delay = baseDelay * Math.pow(2, attempt)
                log.info(`exec.safe:${step.name}:retry`, { attempt: attempt + 1, maxAttempts, delayMs: delay })
                await new Promise((r) => setTimeout(r, delay))
              }
            }
          }

          if (lastError) {
            results.push({ step: step.name, ok: false, error: lastError })
            out.fail(
              'SAFE_FAILED',
              `Gate "${step.name}" failed for task ${taskId} after ${maxAttempts} attempt(s). Pipeline stopped.`,
              {
                taskId,
                failedStep: step.name,
                attempts: maxAttempts,
                results,
              },
            )
            return
          }

          results.push({ step: step.name, ok: true })
        }

        // Record successful safe pipeline in session manifest
        try {
          const modifiedFiles = spawnSync('git', ['diff', '--name-only', '--diff-filter=MAR', 'HEAD'], {
            cwd: opts.dir,
            encoding: 'utf-8',
            timeout: 5000,
          })
          const fileList = modifiedFiles.stdout?.trim().split('\n').filter(Boolean) ?? []
          recordInManifest(`safe ${taskId}`, 0, fileList.length, fileList, undefined, taskId)
        } catch {
          /* manifest never breaks exec */
        }

        out.ok({
          taskId,
          steps: results.length,
          passed: true,
          gates: steps.map((s) => s.name),
        })
      },
    )

  cmd
    .command('chain <pipeline>')
    .description('Executa um pipeline de comandos agf separados por ;')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--track', 'Track command usage for auto-wrapper detection', false)
    .action(async (pipeline: string, opts: { dir: string; track?: boolean }) => {
      const out = createCliOutput('exec.chain')
      const steps = pipeline
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
      const results: unknown[] = []
      const store = opts.track ? openStoreOrFail(opts.dir) : null

      for (const step of steps) {
        const parts = step.split(/\s+/)
        const cmd = parts[0]
        const args = parts.slice(1)
        const start = Date.now()
        try {
          const result = await runAgf(cmd, args, { dir: opts.dir })
          if (opts.track && store) {
            trackCommandUsage(store.getDb(), {
              id: randomUUID(),
              projectId: store.getProject()?.id ?? 'unknown',
              command: cmd,
              args: args.join(' '),
              cwd: opts.dir,
              durationMs: Date.now() - start,
              exitCode: 0,
            })
          }
          results.push({
            command: step,
            ok: result.envelope.ok,
            data: result.envelope.data,
            error: result.envelope.error,
            code: result.envelope.code,
          })
        } catch (err) {
          if (opts.track && store) {
            trackCommandUsage(store.getDb(), {
              id: randomUUID(),
              projectId: store.getProject()?.id ?? 'unknown',
              command: cmd,
              args: args.join(' '),
              cwd: opts.dir,
              durationMs: Date.now() - start,
              exitCode: 1,
            })
          }
          results.push({ command: step, ok: false, error: (err as Error).message })
        }
      }

      store?.close()
      const outcome = chainOutcome(results as ChainStepResult[])
      if (!outcome.ok) {
        out.fail(outcome.code ?? 'CHAIN_STEP_FAILED', outcome.error ?? 'chain step failed', results, {
          count: results.length,
        })
        process.exitCode = 1
        return
      }
      out.ok(results, { count: results.length })
    })

  return cmd
}
