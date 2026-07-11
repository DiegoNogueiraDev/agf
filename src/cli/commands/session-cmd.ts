/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf session` — inspects the unified session/runtime read-model (the harness
 * diagram's `session` object: identity · thread · mode · model · run · grants).
 *
 * Deliberately NOT `agf harness` — that is the agent-readiness quality-scoring
 * command. This command never touches src/core/harness/.
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { LocalThreadStore } from '../../core/thread-store/thread-store.js'
import { WorkerStateStore } from '../../core/worker-state/worker-state-store.js'
import { assembleSession, threadRefFromStored } from '../../core/session/session-runtime.js'
import { assembleGrant } from '../../core/session/grants.js'
import { resolveSessionConfig } from '../../core/session/session-config.js'
import { readSwarmSubagents } from '../../core/session/subagents.js'
import { getActiveRun } from '../../core/session/run-store.js'
import { dispatchCommand } from '../../core/session/session-command.js'
import { createSessionEffects } from '../../core/session/session-effects.js'
import { SessionEventLog, type SessionEventEntry } from '../../core/session/session-event-log.js'
import {
  listSessionEvents,
  listSessionEventsSince,
  type SessionEventWithId,
} from '../../core/session/session-event-store.js'
import { HookBus } from '../../core/hooks/hook-bus.js'
import { GraphEventBus } from '../../core/events/event-bus.js'
import type { ToolCapability } from '../../core/permissions/enforcer.js'
import type { PermissionMode } from '../../core/worker-state/worker-state-schema.js'
import { DEFAULT_PERMISSION_MODE } from '../../core/permissions/mode.js'
import {
  SessionAgentRoleSchema,
  SessionCommandSchema,
  type Grants,
  type Session,
  type SessionCommand,
  type SessionModel,
  type SessionThreadRef,
} from '../../schemas/session.schema.js'

const log = createLogger({ layer: 'cli', source: 'session-cmd.ts' })

type DirOpt = { dir: string }
const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

/** Default permission mode when no worker-state is present in the store. */
const DEFAULT_MODE: PermissionMode = DEFAULT_PERMISSION_MODE
const CAPABILITIES: readonly ToolCapability[] = ['read', 'write', 'shell', 'network']

/**
 * Assemble the unified `Session` from real runtime state: the persisted
 * worker-state (mode, identity, model) plus the latest thread. Falls back to
 * sensible defaults when no worker-state file exists. Pure read — caller owns
 * the store lifecycle (does not close it).
 */
export async function assembleSessionFromStore(store: SqliteStore, dir: string): Promise<Session> {
  const threadStore = new LocalThreadStore(store.getDb(), dir)
  const page = await threadStore.listThreads({ limit: 1 })
  const latest = page.threads[0]
  const thread: SessionThreadRef = latest
    ? threadRefFromStored(latest)
    : { id: 'no-thread', model: null, modelProvider: 'unknown', cwd: dir, agentRole: null }

  // Real runtime state: prefer the persisted worker-state over synthetic defaults.
  const workerState = new WorkerStateStore(dir).read()
  const mode: PermissionMode = workerState?.permission_mode ?? DEFAULT_MODE
  const model: SessionModel = {
    id: workerState?.model ?? thread.model ?? 'unknown',
    provider: thread.modelProvider || 'unknown',
  }
  const roleParse = SessionAgentRoleSchema.safeParse(thread.agentRole)
  const run = getActiveRun(store.getDb(), workerState?.session_ref ?? undefined)
  return assembleSession({
    sessionId: workerState?.session_ref ?? null,
    workerId: workerState?.worker_id ?? 'cli',
    agentRole: roleParse.success ? roleParse.data : null,
    workspace: workerState?.cwd ?? dir,
    thread,
    mode,
    model,
    run,
  })
}

/** Compute the grant for each capability under `mode`, rooted at `dir`. */
export function computeSessionGrants(mode: PermissionMode, dir: string): Grants {
  return CAPABILITIES.map((capability) => assembleGrant(mode, { capability, cwd: dir }, { tool: capability }))
}

/**
 * One poll iteration for `session events --follow`: returns events newer than
 * `cursor` and the advanced cursor (max id seen). The streaming loop calls this
 * repeatedly; isolating it keeps the cursor logic testable.
 */
export function pollSessionEventsOnce(
  store: SqliteStore,
  cursor: number,
): { events: SessionEventWithId[]; cursor: number } {
  const events = listSessionEventsSince(store.getDb(), cursor)
  const next = events.length > 0 ? events[events.length - 1].id : cursor
  return { events, cursor: next }
}

/**
 * Run a downward command against the assembled session, capturing the upward
 * events it produces. Demonstrates the full `comandos ↓ / eventos ↑` loop in one
 * shot. Caller owns the store lifecycle.
 */
export async function runDispatch(
  store: SqliteStore,
  dir: string,
  command: SessionCommand,
): Promise<{ mode: PermissionMode; events: SessionEventEntry[] }> {
  const session = await assembleSessionFromStore(store, dir)
  const bus = new HookBus(new GraphEventBus())
  const eventLog = new SessionEventLog()
  eventLog.install(bus, store.getDb()) // persist dispatched events to session_events
  const effects = createSessionEffects({ cwd: dir }) // durable set_mode / approve effects
  const next = await dispatchCommand(session, command, bus, effects)
  return { mode: next.mode, events: eventLog.list() }
}

/** Builds the `agf session` CLI command (Commander definition). */
export function sessionCommand(): Command {
  log.info('session command registered')
  const cmd = new Command('session').description('Inspect the unified session/runtime (show, grants, events)')

  dirOpt(cmd.command('show').description('Assemble and print the unified session read-model')).action(
    async (opts: DirOpt) => {
      const out = createCliOutput('session.show')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const session = await assembleSessionFromStore(store, opts.dir)
        out.ok({ session })
      } catch (e) {
        out.err('SESSION_ASSEMBLE_FAILED', getErrorMessage(e))
      } finally {
        store.close()
      }
    },
  )

  dirOpt(cmd.command('grants').description('Show the grant verdict + approval status per capability')).action(
    (opts: DirOpt) => {
      const out = createCliOutput('session.grants')
      try {
        out.ok({ mode: DEFAULT_MODE, grants: computeSessionGrants(DEFAULT_MODE, opts.dir) })
      } catch (e) {
        out.err('SESSION_GRANTS_FAILED', getErrorMessage(e))
      }
    },
  )

  dirOpt(
    cmd
      .command('events')
      .description('List the upward session events — persisted history + the channels (or stream with --follow)')
      .option('--limit <n>', 'max events to return', '50')
      .option('--follow', 'stream new events as NDJSON until interrupted', false)
      .option('--interval <ms>', 'poll interval for --follow', '1000'),
  ).action((opts: DirOpt & { limit?: string; follow?: boolean; interval?: string }) => {
    const out = createCliOutput('session.events')
    if (opts.follow) {
      followSessionEvents(opts.dir, Number.parseInt(opts.interval ?? '1000', 10) || 1000)
      return
    }
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const limit = Number.parseInt(opts.limit ?? '50', 10)
      out.ok({
        channels: ['session:message-update', 'session:mode-changed', 'approval:required'],
        events: listSessionEvents(store.getDb(), { limit: Number.isNaN(limit) ? 50 : limit }),
      })
    } catch (e) {
      out.err('SESSION_EVENTS_FAILED', getErrorMessage(e))
    } finally {
      store.close()
    }
  })

  cmd
    .command('config')
    .description('Show the harness-level session config (preset, provider, model pin, flags)')
    .action(() => {
      const out = createCliOutput('session.config')
      out.ok({ config: resolveSessionConfig() })
    })

  dirOpt(cmd.command('subagents').description('List the subagents the harness tracks (live swarm registry)')).action(
    (opts: DirOpt) => {
      const out = createCliOutput('session.subagents')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok({ subagents: readSwarmSubagents(store.getDb()) })
      } catch (e) {
        out.err('SESSION_SUBAGENTS_FAILED', getErrorMessage(e))
      } finally {
        store.close()
      }
    },
  )

  dirOpt(
    cmd
      .command('dispatch')
      .description('Send a command DOWN into the session loop and capture the upward events')
      .argument('<type>', 'set_mode | approve | interrupt | send_message')
      .option('--mode <mode>', 'permission mode for set_mode')
      .option('--request-id <id>', 'request id for approve')
      .option('--text <text>', 'message text for send_message'),
  ).action(async (type: string, opts: DirOpt & { mode?: string; requestId?: string; text?: string }) => {
    const out = createCliOutput('session.dispatch')
    const parsed = SessionCommandSchema.safeParse(buildCommand(type, opts))
    if (!parsed.success) {
      out.err('INVALID_COMMAND', `Invalid session command: ${type}`)
      return
    }
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      out.ok(await runDispatch(store, opts.dir, parsed.data))
    } catch (e) {
      out.err('SESSION_DISPATCH_FAILED', getErrorMessage(e))
    } finally {
      store.close()
    }
  })

  cmd.action(() => {
    const out = createCliOutput('session')
    out.err('UNKNOWN_SUBCOMMAND', 'Usage: agf session <show|grants|events|config|subagents|dispatch>')
  })

  return cmd
}

/** Map CLI args to a raw command object for `SessionCommandSchema` to validate. */
function buildCommand(
  type: string,
  opts: { mode?: string; requestId?: string; text?: string },
): Record<string, unknown> {
  switch (type) {
    case 'set_mode':
      return { type, mode: opts.mode }
    case 'approve':
      return { type, requestId: opts.requestId }
    case 'send_message':
      return { type, text: opts.text }
    default:
      return { type }
  }
}

/**
 * Stream new session events, polling the store on an interval until the process
 * is interrupted. Each event is emitted as one JSON envelope through the
 * sanctioned output layer (createCliOutput) — never raw stdout. The application
 * consumer for `eventos ↑`.
 */
function followSessionEvents(dir: string, intervalMs: number): void {
  const store = openStoreOrFail(dir, { requireExisting: true })
  let cursor = 0
  const tick = (): void => {
    const result = pollSessionEventsOnce(store, cursor)
    cursor = result.cursor
    for (const ev of result.events) createCliOutput('session.events').ok({ event: ev })
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  const shutdown = (): void => {
    clearInterval(timer)
    store.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
