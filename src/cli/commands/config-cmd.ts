/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_d7c3201b8c37 — agf config get|set|list
 * Reads/writes project settings via store.getProjectSetting / setProjectSetting.
 * Unknown keys → typed error at boundary (NFR config-validated-at-boundary).
 */
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { GraphError } from '../../core/utils/errors.js'

export const CONFIG_KEYS = ['provider', 'provider_base_url', 'model'] as const
export type ConfigKey = (typeof CONFIG_KEYS)[number]

function assertValidKey(key: string): asserts key is ConfigKey {
  if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
    throw new GraphError(`Chave de config desconhecida: "${key}". Válidas: ${CONFIG_KEYS.join(', ')}`)
  }
}

export function configGet(store: SqliteStore, key: string): string | null {
  assertValidKey(key)
  return store.getProjectSetting(key)
}

export function configSet(store: SqliteStore, key: string, value: string): void {
  assertValidKey(key)
  store.setProjectSetting(key, value)
}

export function configList(store: SqliteStore): Array<{ key: string; value: string | null }> {
  return CONFIG_KEYS.map((key) => ({ key, value: store.getProjectSetting(key) }))
}

export function configCommand(): Command {
  const cmd = new Command('config').description('Manage project config settings')

  cmd
    .command('get <key>')
    .description('Get a config value')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((key: string, opts: { dir: string }) => {
      const out = createCliOutput('config get')
      const store = openStoreOrFail(opts.dir)
      try {
        const value = configGet(store, key)
        out.ok({ key, value })
      } catch (err) {
        out.fail('INVALID_CONFIG_KEY', err instanceof Error ? err.message : String(err), { key })
      } finally {
        store.close()
      }
    })

  cmd
    .command('set <key> <value>')
    .description('Set a config value')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((key: string, value: string, opts: { dir: string }) => {
      const out = createCliOutput('config set')
      const store = openStoreOrFail(opts.dir)
      try {
        configSet(store, key, value)
        out.ok({ key, value })
      } catch (err) {
        out.fail('INVALID_CONFIG_KEY', err instanceof Error ? err.message : String(err), { key })
      } finally {
        store.close()
      }
    })

  cmd
    .command('list')
    .description('List all config settings')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('config list')
      const store = openStoreOrFail(opts.dir)
      try {
        const entries = configList(store)
        out.ok({ entries })
      } finally {
        store.close()
      }
    })

  return cmd
}
