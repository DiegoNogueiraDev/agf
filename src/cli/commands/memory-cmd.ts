/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import {
  writeMemory,
  readMemory,
  listMemories,
  deleteMemory,
  searchMemories,
  readAllMemories,
} from '../../core/memory/memory-reader.js'
import { applyDecayFilter } from '../../core/memory/pheromone-decay.js'
import { readPheromoneTrailsLazy } from '../../core/colony/pheromone-memory.js'
import { searchAllTiers } from '../../core/memory/memgpt-tiers.js'
import { mineConversation } from '../../core/memory/convo-miner.js'
import { persistHelper, discoverHelper } from '../../core/memory/helper-registry.js'
import { openStoreIfExists } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { errMessage, isBlank } from '../shared/coerce.js'
import { groundCitations } from '../../core/citations/citation-grounding.js'

const log = createLogger({ layer: 'cli', source: 'memory-cmd.ts' })

/** Count deposited pheromone trails (zero-LLM, ~1ms) — cold-colony guard for the decay read. */
function countPheromoneTrails(db: import('better-sqlite3').Database): number {
  try {
    const row = db.prepare('SELECT COUNT(*) as c FROM pheromone_trails').get() as { c: number } | undefined
    return row?.c ?? 0
  } catch {
    return 0
  }
}

/** Builds the `agf memory` CLI command (Commander definition). */
export function memoryCommand(): Command {
  log.info('memory command registered')
  const cmd = new Command('memory').description('Gerencia memórias do projeto (write/read/list/search/rm)')

  cmd
    .command('write')
    .description('Escreve uma memória (conteúdo inline ou de arquivo)')
    .argument('<name>', 'Nome da memória')
    .option('--content <text>', 'Conteúdo inline')
    .option('--file <path>', 'Lê o conteúdo de um arquivo')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(async (name: string, opts: { content?: string; file?: string; dir: string }) => {
      const out = createCliOutput('memory.write')
      if (isBlank(name)) {
        out.err('INVALID_INPUT', 'Nome da memória vazio')
        return
      }
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
      try {
        await writeMemory(opts.dir, name, content)
        out.ok({ name, bytes: Buffer.byteLength(content), citations: groundCitations(content) })
      } catch (e) {
        out.err('WRITE_FAILED', `Falha ao gravar memória "${name}": ${errMessage(e)}`)
      }
    })

  cmd
    .command('read')
    .description('Lê uma memória')
    .argument('<name>', 'Nome da memória')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(async (name: string, opts: { dir: string }) => {
      const out = createCliOutput('memory.read')
      const mem = await readMemory(opts.dir, name)
      if (!mem) {
        out.err('NOT_FOUND', `Memória não encontrada: ${name}`)
        return
      }
      out.ok({ name: mem.name, content: mem.content })
    })

  cmd
    .command('list')
    .description('Lista as memórias do projeto')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(async (opts: { dir: string }) => {
      const out = createCliOutput('memory.list')
      const names = await listMemories(opts.dir)
      out.ok(names, { count: names.length })
    })

  cmd
    .command('rm')
    .description('Remove uma memória')
    .argument('<name>', 'Nome da memória')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(async (name: string, opts: { dir: string }) => {
      const out = createCliOutput('memory.rm')
      const ok = await deleteMemory(opts.dir, name)
      if (!ok) {
        out.err('NOT_FOUND', `Memória não encontrada: ${name}`)
      } else {
        out.ok({ name, removed: true })
      }
    })

  cmd
    .command('search')
    .description('Busca memórias por conteúdo textual')
    .argument('<query>', 'Termo de busca')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-n, --limit <n>', 'Número máximo de resultados', '10')
    .option('--decay', 'Ordena por força de feromônio (effective_strength) e exclui trilhas fracas (< ε=0.1)', false)
    .option('--tiers', 'Busca MemGPT em todas as camadas (hot/warm/cold) com ranking de relevância', false)
    .action(async (query: string, opts: { dir: string; limit: string; decay: boolean; tiers: boolean }) => {
      const out = createCliOutput('memory.search')
      const limit = parseInt(opts.limit, 10) || 10

      if (opts.tiers) {
        const store = openStoreIfExists(opts.dir)
        try {
          const results = await searchAllTiers(query, { db: store?.getDb(), basePath: opts.dir }, { limit })
          out.ok(results, { count: results.length, mode: 'tiers' })
        } catch (e) {
          out.err('SEARCH_FAILED', `Falha na busca em camadas: ${errMessage(e)}`)
        } finally {
          store?.close()
        }
        return
      }

      if (opts.decay) {
        // Cold-colony guard: skip the filesystem read entirely when the colony has
        // deposited zero pheromone trails — nothing would survive the decay filter
        // anyway, so a new project pays zero read cost (§E3.1 pheromone-memory).
        const store = openStoreIfExists(opts.dir)
        const depositedCount = store ? countPheromoneTrails(store.getDb()) : 0
        store?.close()

        const shouldRead = readPheromoneTrailsLazy(depositedCount, () => ['warm'] as const).length > 0
        if (!shouldRead) {
          out.ok([], { count: 0, mode: 'decay' })
          return
        }

        const all = await readAllMemories(opts.dir)
        const q = query.toLowerCase()
        const matching = all.filter((m) => m.name.toLowerCase().includes(q) || m.content.toLowerCase().includes(q))
        const decayed = applyDecayFilter(matching, new Date()).slice(0, limit)
        out.ok(
          decayed.map((t) => ({ name: t.name, effectiveStrength: t.effectiveStrength })),
          { count: decayed.length, mode: 'decay' },
        )
        return
      }

      const results = await searchMemories(opts.dir, query, limit)
      out.ok(results, { count: results.length })
    })

  cmd
    .command('mine-conversation')
    .description('Extrai fatos memoráveis (Decision/Error/Fix/Lesson/Warning/Gotcha) de um log JSONL de sessão')
    .argument('<jsonlFile>', 'Caminho do arquivo .jsonl da sessão')
    .requiredOption('--session-id <id>', 'ID da sessão (usado na chave idempotente + provenance)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(async (jsonlFile: string, opts: { sessionId: string; dir: string }) => {
      const out = createCliOutput('memory.mine-conversation')
      try {
        const jsonl = readFileSync(jsonlFile, 'utf-8')
        const mined = mineConversation(jsonl, { sessionId: opts.sessionId })
        for (const m of mined) {
          await writeMemory(opts.dir, m.name, m.content)
        }
        out.ok({ mined: mined.length, names: mined.map((m) => m.name) })
      } catch (e) {
        out.err('MINE_FAILED', errMessage(e))
      }
    })

  const helperCmd = cmd.command('helper').description('Registro de helpers reutilizáveis (memories/helpers/<key>)')

  helperCmd
    .command('persist <key> <content>')
    .description('Persiste um fragmento de helper sob uma chave estável (idempotente)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(async (key: string, content: string, opts: { dir: string }) => {
      const out = createCliOutput('memory.helper.persist')
      const result = await persistHelper(opts.dir, key, content)
      out.ok(result)
    })

  helperCmd
    .command('get <key>')
    .description('Descobre um helper previamente persistido por chave')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(async (key: string, opts: { dir: string }) => {
      const out = createCliOutput('memory.helper.get')
      const helper = await discoverHelper(opts.dir, key)
      if (!helper) {
        out.err('NOT_FOUND', `Helper não encontrado: ${key}`)
        return
      }
      out.ok(helper)
    })

  return cmd
}
