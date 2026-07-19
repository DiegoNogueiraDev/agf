/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { SubtaskArtifactsStore, type ArtifactKind } from '../../core/store/subtask-artifacts-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { errMessage, isBlank } from '../shared/coerce.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'

const VALID_KINDS: ArtifactKind[] = ['diff', 'file', 'interface', 'decision', 'note']

function isArtifactKind(v: string): v is ArtifactKind {
  return (VALID_KINDS as string[]).includes(v)
}

function withStore<T>(dir: string, fn: (store: SqliteStore) => T): T {
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    return fn(store)
  } finally {
    store.close()
  }
}

/** Builds the `agf artifacts` CLI command (Commander definition). */
export function artifactsCommand(): Command {
  const cmd = new Command('artifacts').description(
    'Artefatos estruturados de subtask (diff/file/interface/decision/note) — v11 context-pollination',
  )

  cmd
    .command('add')
    .description('Registra um artefato de subtask (dedup por conteúdo)')
    .argument('<nodeId>', 'ID do nó dono do artefato')
    .argument('<epicId>', 'ID do épico agregador')
    .requiredOption('--kind <kind>', `Tipo do artefato (${VALID_KINDS.join('|')})`)
    .option('--content <text>', 'Conteúdo inline')
    .option('--file <path>', 'Lê o conteúdo de um arquivo')
    .option('--path <path>', 'Caminho de arquivo relacionado (metadado, opcional)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      (
        nodeId: string,
        epicId: string,
        opts: { kind: string; content?: string; file?: string; path?: string; dir: string },
      ) => {
        const out = createCliOutput('artifacts.add')
        if (!isArtifactKind(opts.kind)) {
          out.err('INVALID_INPUT', `--kind inválido: ${opts.kind}. Use um de: ${VALID_KINDS.join(', ')}`)
          return
        }
        // Capture the narrowed value: TS resets property-narrowing (opts.kind) when it
        // crosses into the withStore(...) callback below, so re-reading opts.kind there
        // widens back to string. The const holds the ArtifactKind narrowing across the closure.
        const kind: ArtifactKind = opts.kind
        let content: string
        if (opts.file) {
          try {
            content = readFileSync(opts.file, 'utf-8')
          } catch (e) {
            out.err('FILE_READ_ERROR', `Não foi possível ler --file ${opts.file}: ${errMessage(e)}`)
            return
          }
        } else {
          content = opts.content ?? ''
        }
        if (isBlank(content)) {
          out.err('INVALID_INPUT', 'Conteúdo vazio: informe --content ou --file')
          return
        }
        try {
          withStore(opts.dir, (store) => {
            if (!store.getNodeById(nodeId)) {
              out.err('NOT_FOUND', `Nó não encontrado: ${nodeId}`)
              return
            }
            const artifacts = new SubtaskArtifactsStore(store)
            const id = artifacts.insert({ nodeId, epicId, kind, content, path: opts.path ?? null })
            out.ok({ id, nodeId, epicId, kind })
          })
        } catch (e) {
          out.err('INSERT_FAILED', `Falha ao registrar artefato: ${errMessage(e)}`)
        }
      },
    )

  cmd
    .command('list')
    .description('Lista artefatos por nó ou por épico')
    .option('--node <id>', 'Filtra por nodeId')
    .option('--epic <id>', 'Filtra por epicId')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { node?: string; epic?: string; dir: string }) => {
      const out = createCliOutput('artifacts.list')
      if (isBlank(opts.node) && isBlank(opts.epic)) {
        out.err('INVALID_INPUT', 'Informe --node ou --epic')
        return
      }
      withStore(opts.dir, (store) => {
        const artifacts = new SubtaskArtifactsStore(store)
        const results = opts.node ? artifacts.listByNode(opts.node) : artifacts.listByEpic(opts.epic!)
        out.ok(results, { count: results.length })
      })
    })

  cmd
    .command('get')
    .description('Busca um artefato pelo id')
    .argument('<id>', 'ID do artefato')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const out = createCliOutput('artifacts.get')
      withStore(opts.dir, (store) => {
        const artifacts = new SubtaskArtifactsStore(store)
        const artifact = artifacts.getById(id)
        if (!artifact) {
          out.err('NOT_FOUND', `Artefato não encontrado: ${id}`)
          return
        }
        out.ok(artifact)
      })
    })

  return cmd
}
