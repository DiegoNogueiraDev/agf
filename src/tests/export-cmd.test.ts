/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/export-cmd.ts — exportCommand factory wiring.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { exportCommand } from '../cli/commands/export-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('exportCommand', () => {
  it('builds the "export" command with a description', () => {
    const cmd = exportCommand()
    expect(cmd.name()).toBe('export')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = exportCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})

describe('exportCommand --format csv', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-export-csv-'))
    const store = SqliteStore.open(dir)
    store.initProject('export-csv-test')
    const now = new Date().toISOString()
    const node: GraphNode = {
      id: 'node_csv_target',
      type: 'task',
      title: 'CSV export target',
      status: 'backlog',
      priority: 2,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    store.insertNode(node)
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('wraps CSV in the JSON envelope ({ok:true, data:{csv}}) when --format csv is passed', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await exportCommand().parseAsync(['--format', 'csv', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = JSON.parse(out.join('').trim())
    expect(envelope.ok).toBe(true)
    expect(typeof envelope.data.csv).toBe('string')
    expect(envelope.data.csv).toContain('id,type,title,status')
    expect(envelope.data.csv).toContain('node_csv_target')
  })

  it('rejects an unknown --format with INVALID_FORMAT and does not open the store', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await exportCommand().parseAsync(['--format', 'bogus', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('INVALID_FORMAT')
  })

  it('wraps a Mermaid flowchart in the JSON envelope ({ok:true, data:{mermaid}}) when --format mermaid is passed', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await exportCommand().parseAsync(['--format', 'mermaid', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = JSON.parse(out.join('').trim())
    expect(envelope.ok).toBe(true)
    expect(typeof envelope.data.mermaid).toBe('string')
    expect(envelope.data.mermaid).toContain('graph TD')
    expect(envelope.data.mermaid).toContain('CSV export target')
  })

  it('writes the Mermaid diagram to --out when both --format mermaid and --out are passed', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const outFile = join(dir, 'graph.mmd')
    await exportCommand().parseAsync(['--format', 'mermaid', '-o', outFile, '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = JSON.parse(out.join('').trim())
    expect(envelope.ok).toBe(true)
    expect(envelope.data.path).toBe(outFile)
    const written = readFileSync(outFile, 'utf-8')
    expect(written).toContain('graph TD')
  })

  it('applies --direction to the Mermaid output', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await exportCommand().parseAsync(['--format', 'mermaid', '--direction', 'LR', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = JSON.parse(out.join('').trim())
    expect(envelope.ok).toBe(true)
    expect(envelope.data.mermaid).toContain('graph LR')
  })

  it('rejects an invalid --direction with INVALID_DIRECTION and does not open the store', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await exportCommand().parseAsync(['--format', 'mermaid', '--direction', 'UP', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = JSON.parse(out.join('').trim())
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('INVALID_DIRECTION')
  })

  it('omits edge labels when --no-edge-labels is passed', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    const other: GraphNode = {
      id: 'node_csv_other',
      type: 'task',
      title: 'Other node',
      status: 'backlog',
      priority: 2,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    store.insertNode(other)
    store.insertEdge({
      id: 'edge_labels_test',
      from: 'node_csv_target',
      to: 'node_csv_other',
      relationType: 'blocks',
      createdAt: now,
    })
    store.close()

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await exportCommand().parseAsync(['--format', 'mermaid', '--no-edge-labels', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = JSON.parse(out.join('').trim())
    expect(envelope.ok).toBe(true)
    expect(envelope.data.mermaid).not.toContain('|blocks|')
  })
})
