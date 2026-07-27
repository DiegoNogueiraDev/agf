#!/usr/bin/env node
/**
 * Roda os testes de CONVENÇÃO — os que o `test:blast` nunca alcança.
 *
 * PORQUÊ: `vitest --changed` segue o grafo de imports do Vite. Um teste que
 * inspeciona o repositório pelo filesystem (`readFileSync`/`readdirSync`/
 * `execFileSync`) não importa nada do código que você mudou, então NUNCA é
 * "afetado" e NUNCA roda no gate por task. São justamente os guards de
 * convenção: sigilo, tamanho de arquivo, isolamento de camada, sincronia de
 * skills.
 *
 * Incidente que originou este script (node_f28247996d57): dois arquivos com um
 * identificador privado de cliente foram commitados e PUSHADOS. O guard existia
 * e estava verde na suíte completa — só não rodou no momento que importava.
 *
 * Descoberta DINÂMICA de propósito: uma lista fixa envelhece em silêncio, e o
 * próximo guard escrito ficaria de fora sem ninguém perceber.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const TEST_DIR = 'src/tests'
/** APIs que denunciam um teste que lê o repositório em vez de importar código. */
const FS_APIS = /readFileSync|readdirSync|execFileSync/

function conventionTests(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...conventionTests(path))
    } else if (entry.name.endsWith('.test.ts') && FS_APIS.test(readFileSync(path, 'utf-8'))) {
      found.push(path)
    }
  }
  return found
}

const files = conventionTests(TEST_DIR)
if (files.length === 0) {
  console.error('[convention] nenhum teste fs-based encontrado — o detector quebrou?')
  process.exit(1)
}
console.error(`[convention] ${files.length} guards de convenção (invisíveis ao blast)`)
const res = spawnSync('npx', ['vitest', 'run', '--project=node', ...files], { stdio: 'inherit' })
process.exit(res.status ?? 1)
