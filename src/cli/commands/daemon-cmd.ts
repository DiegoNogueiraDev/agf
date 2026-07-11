/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { reapDaemons } from '../../core/daemon/daemon-reaper.js'
import { DaemonSelfHealer } from '../../core/daemon/daemon-self-healing.js'
import { readDaemonMeta, DAEMON_META_FILE } from '../../core/daemon/daemon-meta.js'
import { resolveDaemonPaths } from '../../core/daemon/daemon-paths.js'
import { pingAppServer } from '../../core/app-server/ping.js'
import { startUnixEchoServer } from '../../core/app-server/unix-echo-server.js'
import { startWsEchoServer } from '../../core/app-server/ws-echo-server.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'daemon.ts' })

// Delegates to resolveDaemonPaths (canonicalizes via realpath) instead of hashing
// the raw dir string — two callers referring to the same workspace via different
// symlink chains (e.g. /tmp vs /private/tmp on macOS) now hash to the same state dir.
function stateDir(dir: string): string {
  return resolveDaemonPaths(dir).stateDir
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Builds the `agf daemon` CLI command (Commander definition). */
export function daemonCommand(): Command {
  const cmd = new Command('daemon').description('Inspect and clean up mcp-graph daemons')

  cmd
    .command('prune')
    .description('Kill orphaned daemons (workspace gone) and remove stale state dirs')
    .option('--dry-run', 'Show what would be reaped without killing or deleting', false)
    .action((opts: { dryRun: boolean }) => {
      log.info('cli:daemon:prune', { dryRun: opts.dryRun })
      const out = createCliOutput('daemon-prune')
      const report = reapDaemons({ dryRun: opts.dryRun })
      out.ok({
        dryRun: opts.dryRun,
        scanned: report.scanned,
        killed: report.killed,
        removed: report.removed,
        kept: report.kept,
        actions: report.actions.map((a) => ({
          outcome: a.outcome,
          stateDir: a.stateDir,
          pid: a.pid,
          reason: a.reason,
        })),
      })
    })

  cmd
    .command('list')
    .description('List daemon state directories and their status (read-only)')
    .action(() => {
      const out = createCliOutput('daemon-list')
      const report = reapDaemons({ dryRun: true })
      out.ok({
        scanned: report.scanned,
        alive: report.kept,
        actions: report.actions.map((a) => ({
          would: a.outcome === 'kept' ? 'alive' : `stale → would ${a.outcome}`,
          stateDir: a.stateDir,
          pid: a.pid,
          reason: a.reason,
        })),
      })
    })

  cmd
    .command('start')
    .description('Start the mcp-graph daemon in background')
    .option('-d, --dir <dir>', 'Workspace directory', process.cwd())
    .option('-p, --port <n>', 'Port for the daemon', '4555')
    .action(async (opts: { dir: string; port: string }) => {
      const out = createCliOutput('daemon-start')
      const dir = opts.dir
      const sd = stateDir(dir)
      const meta = readDaemonMeta(sd)

      if (meta && isPidAlive(meta.pid)) {
        out.ok({ started: false, pid: meta.pid, message: `Daemon already running (pid ${meta.pid})` })
        return
      }

      try {
        const child = spawn(
          'node',
          ['--import', 'tsx', join(dir, 'src', 'cli', 'index.ts'), 'ui', '--port', opts.port],
          {
            cwd: dir,
            detached: true,
            stdio: 'ignore',
          },
        )
        child.unref()
        out.ok({ started: true, pid: child.pid, message: `Daemon started (pid ${child.pid}) on port ${opts.port}` })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const recipe = new DaemonSelfHealer().diagnose({ message, exitCode: 1 })
        if (recipe) {
          out.fail('DAEMON_START_FAILED', message, { suggestedFix: recipe })
        } else {
          out.err('DAEMON_START_FAILED', message)
        }
      }
    })

  cmd
    .command('stop')
    .description('Stop the mcp-graph daemon for this workspace')
    .option('-d, --dir <dir>', 'Workspace directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('daemon-stop')
      const sd = stateDir(opts.dir)
      const meta = readDaemonMeta(sd)

      if (!meta) {
        out.ok({ stopped: false, message: 'No daemon found for this workspace.' })
        return
      }

      if (!isPidAlive(meta.pid)) {
        out.ok({
          stopped: false,
          message: `Daemon pid ${meta.pid} is not running (stale). Use 'agf daemon prune' to clean up.`,
        })
        return
      }

      try {
        process.kill(meta.pid, 'SIGTERM')
        out.ok({ stopped: true, pid: meta.pid, message: `Daemon (pid ${meta.pid}) stopped.` })
      } catch (err) {
        out.err('DAEMON_STOP_FAILED', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('status')
    .description('Check if the mcp-graph daemon is running for this workspace')
    .option('-d, --dir <dir>', 'Workspace directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('daemon-status')
      const sd = stateDir(opts.dir)
      const metaFilePath = join(sd, DAEMON_META_FILE)

      if (!existsSync(metaFilePath)) {
        out.ok({ running: false, pid: null, message: 'No daemon found for this workspace.' })
        return
      }

      const meta = readDaemonMeta(sd)
      if (!meta) {
        out.ok({ running: false, pid: null, message: 'Daemon metadata corrupted.' })
        return
      }

      const alive = isPidAlive(meta.pid)
      out.ok({
        running: alive,
        pid: meta.pid,
        startedAt: meta.startedAt,
        workspacePath: meta.workspacePath,
        message: alive ? `Daemon running (pid ${meta.pid})` : `Daemon not running (pid ${meta.pid} is dead)`,
      })
    })

  cmd
    .command('ping <url>')
    .description('Round-trip a request through an app-server WebSocket URL (e.g. ws://localhost:4555)')
    .option('-t, --timeout <ms>', 'Timeout in milliseconds', '5000')
    .action(async (url: string, opts: { timeout: string }) => {
      const out = createCliOutput('daemon-ping')
      try {
        const result = await pingAppServer(url, Number(opts.timeout))
        out.ok(result)
      } catch (err) {
        out.err('APP_SERVER_UNREACHABLE', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('serve-unix <path>')
    .description('Start a Unix-socket app-server echo listener at <path> (foreground; Ctrl-C to stop)')
    .action((path: string) => {
      const out = createCliOutput('daemon-serve-unix')
      const handle = startUnixEchoServer(path)
      out.ok({ listening: true, path, hint: 'Ctrl+C para parar' })
      const shutdown = (): void => {
        handle.close()
        process.exit(0)
      }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })

  cmd
    .command('serve-ws <port>')
    .description('Start a WebSocket app-server echo listener at <port> (foreground; Ctrl-C to stop)')
    .action((port: string) => {
      const out = createCliOutput('daemon-serve-ws')
      const handle = startWsEchoServer(Number(port))
      out.ok({ listening: true, port: Number(port), hint: 'Ctrl+C para parar' })
      const shutdown = (): void => {
        handle.close()
        process.exit(0)
      }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })

  return cmd
}
