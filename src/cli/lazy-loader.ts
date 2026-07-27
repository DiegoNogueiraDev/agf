import { Command } from 'commander'
import { createLogger } from '../core/utils/logger.js'
import { recordCommandInvocation } from '../core/observability/command-ledger.js'
import { incrementCommand } from '../core/economy/token-economy-file.js'
import { openStoreIfExists } from './open-store.js'
import { setCurrentCommand } from '../core/output/writer.js'
import { withToolHooks } from '../core/hooks/tool-hook-wrapper.js'
import { getSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

const log = createLogger({ layer: 'cli', source: 'lazy-loader.ts' })

type CommandFactory = () => Command | Promise<Command>

export class LazyCommandLoader {
  private readonly factories = new Map<string, { factory: CommandFactory; description: string }>()
  private readonly cache = new Map<string, Command>()

  register(name: string, factory: CommandFactory, description?: string): void {
    this.factories.set(name, { factory, description: description ?? '' })
    this.cache.delete(name)
  }

  listCommands(): Array<{ name: string; description: string }> {
    return [...this.factories.entries()].map(([name, { description }]) => ({
      name,
      description,
    }))
  }

  async getCommand(name: string): Promise<Command | undefined> {
    const cached = this.cache.get(name)
    if (cached) return cached

    const entry = this.factories.get(name)
    if (!entry) return undefined

    const cmd = await entry.factory()
    this.cache.set(name, cmd)
    return cmd
  }
}

export function createLazyCommand(name: string, description: string, loader: () => Promise<Command>): Command {
  log.debug(`createLazyCommand: ${name}`)
  const proxy = new Command(name)
  proxy.description(description)

  proxy.allowUnknownOption(true)
  proxy.allowExcessArguments(true)
  proxy.helpOption(false)

  proxy.action(async function (this: Command) {
    const startMs = Date.now()
    const argv = process.argv
    const tokenIndex = argv.indexOf(name, 2)
    const forwarded = tokenIndex >= 0 ? argv.slice(tokenIndex + 1) : this.args
    const inputBytes = forwarded.reduce((sum: number, a: string) => sum + Buffer.byteLength(a, 'utf8'), 0)

    // Capture stdout to measure output bytes
    const originalWrite = process.stdout.write.bind(process.stdout)
    let outputBytes = 0
    const captureWrite: typeof process.stdout.write = ((
      chunk: string | Uint8Array,
      encodingOrCb?: BufferEncoding | ((err?: Error) => void),
      cb?: (err?: Error) => void,
    ): boolean => {
      outputBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.length
      return originalWrite(chunk as never, encodingOrCb as never, cb as never)
    }) as typeof process.stdout.write
    process.stdout.write = captureWrite

    try {
      setCurrentCommand(name)
      const real = await loader()
      const runWithHooks = withToolHooks(
        name,
        async () => {
          await real.parseAsync(forwarded, { from: 'user' })
          return undefined
        },
        getSharedHookBus(),
      )
      await runWithHooks({})
    } finally {
      process.stdout.write = originalWrite
    }

    const durationMs = Date.now() - startMs
    const cwd = process.cwd()

    // SQLite ledger (internal)
    let store: SqliteStore | undefined
    try {
      store = openStoreIfExists(cwd)
      if (store) {
        let graphExportBytes = 0
        try {
          const r = store.getDb().prepare('SELECT COUNT(*) as n FROM nodes').get() as { n: number }
          graphExportBytes = (r.n ?? 0) * 500 // ~500 bytes per node (title + desc + metadata)
        } catch {
          /* nodes table may not exist yet */
        }
        recordCommandInvocation(store.getDb(), {
          command: name,
          inputBytes,
          outputBytes,
          cached: false,
          durationMs,
          graphExportBytes,
        })
      }
    } catch {
      // never fail the command because ledger recording failed
    } finally {
      try {
        store?.close()
      } catch {
        /* ignore */
      }
    }

    // Materialized JSON file at ~/.config/agf (global, across all projects)
    try {
      incrementCommand(cwd, name, inputBytes, outputBytes, durationMs)
    } catch {
      // never fail the command because file writing failed
    }
  })

  return proxy
}
