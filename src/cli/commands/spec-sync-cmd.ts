/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { basename } from 'node:path'
import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { SpecStore } from '../../core/spec-evolution/spec-store.js'
import { specSyncStatus } from '../../core/spec-evolution/sync-engine.js'
import { openStoreOrFail } from '../open-store.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'spec-sync-cmd.ts' })

function projectId(store: SqliteStore): string {
  return store.getProject()?.id ?? 'default'
}

interface SpecRow {
  id: string
  name: string
  version: number
  status: string
}

/** Builds the `agf spec-sync` CLI command (Commander definition). */
export function specSyncCommand(): Command {
  log.info('spec-sync command registered')
  const cmd = new Command('spec-sync').description('Specs vivos: register/list/status/link (versionados)')

  cmd
    .command('register <file>')
    .description('Registra um spec versionado a partir de um arquivo')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--name <name>', 'Nome do spec (default: nome do arquivo)')
    .action((file: string, opts: { dir: string; name?: string }) => {
      const out = createCliOutput('spec-sync-register')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const content = readFileSync(file, 'utf8')
        const spec = new SpecStore(store.getDb()).register({
          projectId: projectId(store),
          name: opts.name ?? basename(file),
          content,
          filePath: file,
        })
        out.ok({ specId: spec.id, name: spec.name, version: spec.version })
      } catch (err) {
        out.err('REGISTER_FAILED', err instanceof Error ? err.message : String(err))
      } finally {
        store.close()
      }
    })

  cmd
    .command('list', { isDefault: true })
    .description('Lista os specs do projeto')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('spec-sync-list')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const rows = store
          .getDb()
          .prepare('SELECT id, name, version, status FROM spec_documents WHERE project_id = ? ORDER BY updated_at DESC')
          .all(projectId(store)) as SpecRow[]
        out.ok({ specs: rows })
      } finally {
        store.close()
      }
    })

  cmd
    .command('status <specId> <file>')
    .description('Compara o conteúdo atual do arquivo com o spec registrado')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((specId: string, file: string, opts: { dir: string }) => {
      const out = createCliOutput('spec-sync-status')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const specStore = new SpecStore(store.getDb())
        const status = specSyncStatus(specStore, specId, readFileSync(file, 'utf8'))
        out.ok(status)
      } catch (err) {
        out.err('STATUS_FAILED', err instanceof Error ? err.message : String(err))
      } finally {
        store.close()
      }
    })

  cmd
    .command('link <specId> <nodeId>')
    .description('Liga um spec a um node do grafo (implements)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--section <title>', 'Seção do spec', '')
    .option('--type <type>', 'Tipo de link', 'implements')
    .action((specId: string, nodeId: string, opts: { dir: string; section: string; type: string }) => {
      const out = createCliOutput('spec-sync-link')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        new SpecStore(store.getDb()).linkNode(specId, nodeId, opts.section, opts.type)
        out.ok({ specId, nodeId, type: opts.type })
      } catch (err) {
        out.err('LINK_FAILED', err instanceof Error ? err.message : String(err))
      } finally {
        store.close()
      }
    })

  return cmd
}
