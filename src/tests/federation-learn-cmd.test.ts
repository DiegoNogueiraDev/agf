/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do node_a67e514c6399 (B3 da federação) — superfície CLI no comando
 * federation EXISTENTE: `federation export-learning [--out]` (bundle do
 * projeto) e `federation learn --from <bundle.json|dir>` (import decay-aware
 * via importLearning). Envelope {ok,data,meta}; erro de path/uso é tipado,
 * nunca stack trace cru.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { LEARNING_BUNDLE_VERSION, type LearningBundle } from '../core/knowledge/knowledge-packager.js'
import { federationCommand } from '../cli/commands/federation-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const original = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  const prevExit = process.exitCode
  try {
    await federationCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = original
    process.exitCode = prevExit
  }
  return lastEnvelope(out)
}

function seedProject(dir: string, projectId: string, trailKey: string): void {
  const store = SqliteStore.open(dir)
  store.initProject(projectId)
  depositPheromone(store.getDb(), store.getProject()!.id, trailKey, 6)
  store.close()
}

describe('agf federation learn / export-learning (node_a67e514c6399)', () => {
  const dirs: string[] = []
  const tmp = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'agf-fed-learn-'))
    dirs.push(d)
    return d
  }

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('export-learning --out grava bundle JSON válido com as seções', async () => {
    const selfDir = tmp()
    seedProject(selfDir, 'self-x', 'cli')
    const outFile = join(selfDir, 'bundle.json')

    const env = await run(['export-learning', '--out', outFile, '-d', selfDir])
    expect(env.ok).toBe(true)
    expect(existsSync(outFile)).toBe(true)
    const bundle = JSON.parse(readFileSync(outFile, 'utf8')) as LearningBundle
    expect(bundle.schemaVersion).toBe(LEARNING_BUNDLE_VERSION)
    expect(bundle.pheromones.length).toBeGreaterThan(0)
  })

  it('learn --from bundle.json importa com counts por seção (AC1)', async () => {
    const srcDir = tmp()
    seedProject(srcDir, 'src-proj', 'cli')
    const bundleFile = join(srcDir, 'bundle.json')
    await run(['export-learning', '--out', bundleFile, '-d', srcDir])

    const dstDir = tmp()
    const dst = SqliteStore.open(dstDir)
    dst.initProject('dst-proj')
    dst.close()

    const env = await run(['learn', '--from', bundleFile, '-d', dstDir])
    expect(env.ok).toBe(true)
    const data = env.data as { imported: { pheromones: { imported: number } } }
    expect(data.imported.pheromones.imported).toBe(1)
  })

  it('learn --from <dir de projeto> exporta do graph.db do peer e importa direto', async () => {
    const srcDir = tmp()
    seedProject(srcDir, 'src-proj-dir', 'cli')

    const dstDir = tmp()
    const dst = SqliteStore.open(dstDir)
    dst.initProject('dst-proj-dir')
    dst.close()

    const env = await run(['learn', '--from', srcDir, '-d', dstDir])
    expect(env.ok).toBe(true)
    const data = env.data as { imported: { pheromones: { imported: number } } }
    expect(data.imported.pheromones.imported).toBe(1)
  })

  it('path inexistente (caso de erro) → ok:false com code tipado, sem stack cru (AC2)', async () => {
    const dstDir = tmp()
    const dst = SqliteStore.open(dstDir)
    dst.initProject('dst-err')
    dst.close()

    const env = await run(['learn', '--from', join(dstDir, 'nao-existe.json'), '-d', dstDir])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('LEARN_SOURCE_NOT_FOUND')
  })

  it('bundle com schemaVersion desconhecida → ok:false tipado, banco intacto', async () => {
    const dstDir = tmp()
    const dst = SqliteStore.open(dstDir)
    dst.initProject('dst-badver')
    dst.close()
    const badFile = join(dstDir, 'bad.json')
    writeFileSync(badFile, JSON.stringify({ schemaVersion: 99, pheromones: [], episodicOutcomes: [], decisions: [] }))

    const env = await run(['learn', '--from', badFile, '-d', dstDir])
    expect(env.ok).toBe(false)
    expect(String(env.error)).toContain('schemaVersion')
  })
})
