/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * B4 — `agf loop`: two run-modes for autonomous repetition.
 *
 *  - **Interval mode** (`--every <dur> <command...>`): re-run an inner `agf`
 *    command on a clock, bounded by `--max-runs` and/or `--for`.
 *  - **Dynamic goal mode** (`--goal <rubricFile> --cmd <command>`): run the
 *    inner command, grade its stdout against a rubric (B1, deterministic by
 *    default), and iterate until the rubric all-passes or the budget runs out
 *    (B3 {@link runGoalLoop}).
 *
 * Offline-first: the deterministic rubric path uses {@link evaluateRubric}
 * (zero LLM); the goal iteration itself is factored into {@link runGoalMode},
 * which accepts an injected `attempt` runner so tests need no child process
 * and no provider.
 */

import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import type Database from 'better-sqlite3'
import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { createLogger } from '../../core/utils/logger.js'
import { InvalidArgumentError } from '../../core/utils/errors.js'
import { runAgf } from '../../core/compose/agf-runner.js'
import { runIntervalLoop, parseDuration } from '../../core/autonomy/interval-loop.js'
import { startLoop } from '../../core/autonomy/loop-start.js'
import { listLoopsEnvelope, loopStatusEnvelope } from '../../core/autonomy/loop-list.js'
import { stopLoop, stopAllLoops } from '../../core/autonomy/loop-stop.js'
import { runTick } from '../../core/autonomy/loop-tick.js'
import { Runner } from '../../core/autonomy/runner-fsm.js'
import { openStoreOrFail } from '../open-store.js'
import { runGoalLoop, type GoalStopReason } from '../../core/autonomy/goal-loop.js'
import { buildRubric, evaluateRubric, type Rubric, type RubricSpec } from '../../core/autonomy/rubric.js'
import type { GradeReport } from '../../core/autonomy/grader.js'
import { saveNamedLoop, listNamedLoops, loadNamedLoop } from '../../core/autonomy/named-loops.js'

const log = createLogger({ layer: 'cli', source: 'loop-cmd.ts' })

const DEFAULT_MAX_ITERATIONS = 10

/**
 * Load a rubric from raw text. Accepts either a JSON array of {@link RubricSpec}
 * objects, or one criterion per line (bare AC strings; `#`/blank lines skipped).
 */
export function loadRubricFromText(text: string): Rubric {
  const trimmed = text.trim()
  if (trimmed.startsWith('[')) {
    const specs = JSON.parse(trimmed) as RubricSpec[]
    return buildRubric(specs)
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
  return buildRubric(lines)
}

/**
 * Map a deterministic {@link evaluateRubric} run into a {@link GradeReport}-shaped
 * object (the contract {@link runGoalLoop} grades against). `allPass` reflects the
 * zero-LLM gate; `feedback` lists failing-criteria descriptions for the revise turn.
 */
function evaluationToReport(rubric: Rubric, output: string): GradeReport {
  const evaluation = evaluateRubric(rubric, output)
  const failing = evaluation.results
    .filter((r) => r.kind === 'deterministic' && r.passed !== true)
    .map((r) => rubric.criteria.find((c) => c.id === r.id)?.description ?? r.id)
  return {
    verdicts: evaluation.results.map((r) => {
      const description = rubric.criteria.find((c) => c.id === r.id)?.description ?? r.id
      const passed = r.passed === true
      return {
        id: r.id,
        kind: r.kind,
        passed,
        feedback: passed ? '' : `criterion not met: ${description}`,
      }
    }),
    allPass: evaluation.deterministicAllPass,
    feedback: failing.map((d) => `criterion not met: ${d}`).join('\n'),
    // Deterministic path: no model graded this; cast since GradeReport.graderModel
    // is typed as ModelName but the offline gate uses zero LLM.
    graderModel: 'deterministic' as GradeReport['graderModel'],
    builderModel: 'deterministic',
  }
}

export interface GoalModeResult {
  mode: 'goal'
  stopped: GoalStopReason
  iterations: number
  allPass: boolean
}

export interface GoalModeOptions {
  rubric: Rubric
  /** Produce candidate output for an iteration (injected for tests). */
  attempt: (feedback: string | null, iteration: number) => Promise<string>
  maxIterations: number
  signal?: { aborted: boolean }
}

/**
 * Run the dynamic goal loop against a deterministic rubric. Decoupled from the
 * CLI and from child processes via the injected `attempt` runner — this is the
 * unit-testable, offline path.
 */
export async function runGoalMode(opts: GoalModeOptions): Promise<GoalModeResult> {
  const result = await runGoalLoop(
    {
      attempt: (feedback, iteration) => opts.attempt(feedback, iteration),
      grade: async (output) => evaluationToReport(opts.rubric, output),
    },
    { maxIterations: opts.maxIterations, signal: opts.signal },
  )
  return {
    mode: 'goal',
    stopped: result.stopped,
    iterations: result.iterations,
    allPass: result.report?.allPass ?? false,
  }
}

export interface IntervalTickOptions {
  db: Database.Database
  loopId: string
  cmd: string
  args: string[]
  /** Runs the inner agf command (injected for tests — no real child process). */
  runner: (cmd: string, args: string[]) => Promise<void>
}

// One Runner per loopId — guarantees WIP=1 per loop even if a tick is invoked
// again for the same loopId before the previous one finished.
const tickRunners = new Map<string, Runner<void>>()

function getTickRunner(loopId: string): Runner<void> {
  let runner = tickRunners.get(loopId)
  if (!runner) {
    runner = new Runner<void>()
    tickRunners.set(loopId, runner)
  }
  return runner
}

/**
 * One interval-mode tick for a background loop job (`agf loop start`'s spawned
 * child). Routes through {@link runTick} so the registry's `runs` counter — read
 * by `agf loop status`/`list` — actually advances; before this wiring the
 * spawned child ran the inner command directly and the counter stayed at 0.
 *
 * Serialized per loopId via {@link Runner} (runner-fsm.ts) so concurrent calls
 * for the same loop never overlap — Little's Law WIP=1 applied to loop ticks.
 */
export async function runIntervalTick(opts: IntervalTickOptions): Promise<void> {
  await getTickRunner(opts.loopId).run(() =>
    runTick(opts.db, {
      loopId: opts.loopId,
      kind: 'command',
      payload: [opts.cmd, ...opts.args].join(' '),
      runner: async (payload) => {
        const parts = payload.split(/\s+/)
        await opts.runner(parts[0], parts.slice(1))
      },
    }),
  )
}

/** Split an inner agf command string (`"next --limit 1"`) into [cmd, ...args]. */
function splitCommand(parts: string[]): { cmd: string; args: string[] } {
  if (parts.length === 0) {
    throw new InvalidArgumentError('No inner command provided to loop.')
  }
  return { cmd: parts[0], args: parts.slice(1) }
}

interface LoopOpts {
  dir: string
  every?: string
  maxRuns?: number
  for?: string
  goal?: string
  cmd?: string
  maxIterations: number
  loopId?: string
}

function loopListCommand(): Command {
  return new Command('list')
    .description('List all loop jobs from the registry')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--status <s>', 'Filter by status: running | stopped')
    .option('--json', 'Force JSON envelope output')
    .action((opts: { dir: string; status?: string; json?: boolean }) => {
      const out = createCliOutput('loop.list')
      const store = openStoreOrFail(opts.dir, { requireExisting: false })
      try {
        const result = listLoopsEnvelope(store.getDb(), opts.status as 'running' | 'stopped' | undefined)
        out.ok(result.data)
      } finally {
        store.close()
      }
    })
}

function loopStatusSubcommand(): Command {
  return new Command('status')
    .description('Show a single loop job by id')
    .argument('<id>', 'Loop job id')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--json', 'Force JSON envelope output')
    .action((id: string, opts: { dir: string; json?: boolean }) => {
      const out = createCliOutput('loop.status')
      const store = openStoreOrFail(opts.dir, { requireExisting: false })
      try {
        const result = loopStatusEnvelope(store.getDb(), id)
        if (result.ok) {
          out.ok(result.data)
        } else {
          out.err('NOT_FOUND', `Loop job not found: ${id}`)
        }
      } finally {
        store.close()
      }
    })
}

/** `agf loop stop <id>|all` — kills the pid(s) and marks the registry entry stopped. */
function loopStopCommand(): Command {
  return new Command('stop')
    .description('Stop a loop job by id, or "all" to stop every running loop')
    .argument('<id>', 'Loop job id, or "all" to stop every running loop')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const out = createCliOutput('loop.stop')
      const store = openStoreOrFail(opts.dir, { requireExisting: false })
      try {
        if (id === 'all') {
          out.ok(stopAllLoops(store.getDb()))
          return
        }
        const result = stopLoop(store.getDb(), id)
        if (!result.ok) {
          out.err(result.code, `Loop job not found: ${id}`)
          return
        }
        out.ok(result)
      } finally {
        store.close()
      }
    })
}

/** `agf loop start <payload> --every <dur>` — register and detach a background loop job. */
function loopStartCommand(): Command {
  return new Command('start')
    .description('Start a background loop job (detached, non-blocking)')
    .argument('<payload>', 'Command or prompt to repeat')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--every <dur>', 'Interval (e.g. 5m, 30s)', '5m')
    .option('--max-runs <n>', 'Max runs before auto-stop', (v) => Number.parseInt(v, 10))
    .action((payload: string, opts: { dir: string; every: string; maxRuns?: number }) => {
      const out = createCliOutput('loop.start')
      const store = openStoreOrFail(opts.dir, { requireExisting: false })
      try {
        const result = startLoop(store.getDb(), {
          payload,
          every: opts.every,
          maxRuns: opts.maxRuns,
          spawner: (detached, loopId) => {
            const child = spawn(
              process.execPath,
              [process.argv[1], 'loop', '--every', opts.every, '--loop-id', loopId, payload],
              { detached, stdio: 'ignore' },
            )
            return { pid: child.pid ?? 0, unref: () => child.unref() }
          },
        })
        out.ok(result)
      } catch (err) {
        out.err('LOOP_START_FAILED', (err as Error).message)
      } finally {
        store.close()
      }
    })
}

function loopSaveCommand(): Command {
  return new Command('save')
    .description('Save a named reusable loop definition')
    .argument('<name>', 'Loop name')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--every <dur>', 'Interval (e.g. 1h, 30m)')
    .option('--goal <rubricFile>', 'Goal rubric file path')
    .option('--force', 'Overwrite existing definition')
    .action((name: string, opts: { dir: string; every?: string; goal?: string; force?: boolean }) => {
      const out = createCliOutput('loop.save')
      try {
        const entry = saveNamedLoop(opts.dir, name, { every: opts.every, goal: opts.goal }, { force: opts.force })
        out.ok({ name: entry.name, every: entry.every, goal: entry.goal, createdAt: entry.createdAt })
      } catch (err) {
        out.err('LOOP_SAVE_FAILED', (err as Error).message)
      }
    })
}

function loopRunNamedCommand(): Command {
  return new Command('run')
    .description('Run a previously saved named loop')
    .argument('<name>', 'Loop name to run')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(async (name: string, opts: { dir: string }) => {
      const out = createCliOutput('loop.run')
      const def = loadNamedLoop(opts.dir, name)
      if (!def) {
        out.err('NOT_FOUND', `Named loop "${name}" not found. Use 'agf loop list' to see available loops.`)
        return
      }
      // Re-execute with saved interval+rubric — delegates to interval-loop or goal-loop.
      try {
        if (def.every) {
          const intervalMs = parseDuration(def.every)
          const result = await runIntervalLoop({
            everyMs: intervalMs,
            maxRuns: undefined,
            runOnce: async () => {
              await runAgf('loop', ['--every', def.every ?? '5m'], { dir: opts.dir })
            },
          })
          out.ok({ mode: 'interval', name, runs: result.runs, stopped: result.stopped })
        } else {
          out.err('INVALID_LOOP_DEF', `Loop "${name}" has no interval configured.`)
        }
      } catch (err) {
        out.err('LOOP_RUN_FAILED', (err as Error).message)
      }
    })
}

function loopNamesListCommand(): Command {
  return new Command('names')
    .description('List all saved named loop definitions')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('loop.names')
      const loops = listNamedLoops(opts.dir)
      out.ok({ loops })
    })
}

/** Builds the `agf loop` CLI command (Commander definition). */
export function loopCommand(): Command {
  log.info('loop command registered')
  return (
    new Command('loop')
      .description('Run an inner agf command on an interval, or drive a goal-rubric loop until it passes')
      // Without this, this command's own -d/--dir collides with the identically
      // -named option on subcommands (stop/list/status/...), silently discarding
      // whatever --dir the subcommand was actually called with (see context-cmd.ts).
      .enablePositionalOptions()
      .argument('[command...]', 'Inner agf command for interval mode (with --every)')
      .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
      .option('--every <dur>', 'Interval mode: re-run the command every <dur> (e.g. 5m, 30s, 500ms)')
      .option('--max-runs <n>', 'Interval mode: stop after N runs', (v) => Number.parseInt(v, 10))
      .option('--for <dur>', 'Interval mode: stop after a total wall-clock budget (e.g. 1h)')
      .option('--goal <rubricFile>', 'Goal mode: rubric file (JSON array or one criterion per line)')
      .option('--cmd <command>', 'Goal mode: inner agf command whose output is graded')
      .option('--max-iterations <n>', 'Goal mode: max attempts', (v) => Number.parseInt(v, 10), DEFAULT_MAX_ITERATIONS)
      .option('--loop-id <id>', "Internal: registry row to report ticks against (set by `loop start`'s spawned child)")
      .addCommand(loopStartCommand())
      .addCommand(loopStopCommand())
      .addCommand(loopListCommand())
      .addCommand(loopStatusSubcommand())
      .addCommand(loopSaveCommand())
      .addCommand(loopRunNamedCommand())
      .addCommand(loopNamesListCommand())
      .action(async (command: string[], opts: LoopOpts) => {
        const out = createCliOutput('loop')
        const isInterval = typeof opts.every === 'string'
        const isGoal = typeof opts.goal === 'string'

        if (isInterval === isGoal) {
          out.err(
            'INVALID_MODE',
            'Choose exactly one mode: --every <dur> <command...> OR --goal <rubricFile> --cmd <command>.',
          )
          return
        }

        try {
          if (isInterval) {
            const everyMs = parseDuration(opts.every as string)
            const { cmd, args } = splitCommand(command)
            const maxTotalMs = opts.for ? parseDuration(opts.for) : undefined
            // --loop-id is only set on the child spawned by `loop start`; a bare
            // `agf loop --every ...` invocation has no registry row to report to.
            const store = opts.loopId ? openStoreOrFail(opts.dir, { requireExisting: false }) : undefined
            try {
              const result = await runIntervalLoop({
                everyMs,
                maxRuns: opts.maxRuns,
                maxTotalMs,
                runOnce: async () => {
                  if (store && opts.loopId) {
                    await runIntervalTick({
                      db: store.getDb(),
                      loopId: opts.loopId,
                      cmd,
                      args,
                      runner: async (c, a) => {
                        await runAgf(c, a, { dir: opts.dir })
                      },
                    })
                  } else {
                    await runAgf(cmd, args, { dir: opts.dir })
                  }
                },
              })
              out.ok({ mode: 'interval', runs: result.runs, stopped: result.stopped })
            } finally {
              store?.close()
            }
            return
          }

          // Goal mode.
          if (typeof opts.cmd !== 'string' || opts.cmd.trim().length === 0) {
            out.err('INVALID_MODE', 'Goal mode requires --cmd <command> (the inner agf command to grade).')
            return
          }
          const rubricText = readFileSync(opts.goal as string, 'utf8')
          const rubric = loadRubricFromText(rubricText)
          const { cmd, args } = splitCommand(opts.cmd.trim().split(/\s+/))
          const result = await runGoalMode({
            rubric,
            maxIterations: opts.maxIterations,
            attempt: async () => {
              const run = await runAgf(cmd, args, { dir: opts.dir })
              return run.stdout
            },
          })
          out.ok(result)
        } catch (err) {
          out.err('LOOP_FAILED', (err as Error).message)
        }
      })
  )
}
