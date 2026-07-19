/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/model-cmd.ts — modelCommand factory wiring.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { modelCommand } from '../cli/commands/model-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('modelCommand', () => {
  it('builds the "model" command with a description', () => {
    const cmd = modelCommand()
    expect(cmd.name()).toBe('model')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 5 subcommands', () => {
    expect(modelCommand().commands.length).toBe(5)
  })
})

interface FeaturesEnvelope {
  ok: boolean
  code?: string
  data?: {
    features?: { taskType: string; acCount: number; blastRadius: number; hasExternalDeps: boolean }
  }
}

function lastEnvelope(captured: string[]): FeaturesEnvelope {
  const objs = captured
    .join('')
    .trim()
    .split('\n')
    .filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
  return JSON.parse(objs[objs.length - 1]) as FeaturesEnvelope
}

describe('modelCommand — features subcommand (RL routing features, node_189058f47592)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-model-features-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function seedNode(): void {
    const store = SqliteStore.open(dir)
    store.initProject('model-features-test')
    const now = new Date().toISOString()
    const node: GraphNode = {
      id: 'node_feat_cmd',
      type: 'task',
      title: 'Implement payment API integration',
      description: 'Call the payment API to charge user',
      status: 'backlog',
      priority: 1,
      acceptanceCriteria: ['charge succeeds', 'refund works'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    store.insertNode(node)
    store.close()
  }

  async function runFeatures(args: string[]): Promise<FeaturesEnvelope> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const prevExit = process.exitCode
    await modelCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    return lastEnvelope(out)
  }

  it('extracts and persists task features for a node', async () => {
    seedNode()
    const env = await runFeatures(['features', 'node_feat_cmd', '-d', dir])
    expect(env.ok).toBe(true)
    expect(env.data?.features).toMatchObject({ taskType: 'implement', acCount: 2, hasExternalDeps: true })

    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_feat_cmd')
    store.close()
    expect(node?.metadata?.taskFeatures).toMatchObject({ taskType: 'implement', hasExternalDeps: true })
  })

  it('NOT_FOUND for a missing node id', async () => {
    seedNode()
    const env = await runFeatures(['features', 'node_missing', '-d', dir])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('NOT_FOUND')
  })
})
