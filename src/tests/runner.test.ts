/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/atomic-files/runner.ts — runAtomicWrites.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runAtomicWrites } from '../core/atomic-files/runner.js'
import { registerAtomicFile, clearRegistry } from '../core/atomic-files/registry.js'

let dir: string

beforeEach(async () => {
  clearRegistry()
  dir = await mkdtemp(path.join(tmpdir(), 'atomic-runner-'))
})

afterEach(async () => {
  clearRegistry()
  await rm(dir, { recursive: true, force: true })
})

describe('runAtomicWrites', () => {
  it('returns an empty report when the registry is empty', async () => {
    const report = await runAtomicWrites('init')
    expect(report.size).toBe(0)
  })

  it('writes each registered markdown file and reports per fileId', async () => {
    const target = path.join(dir, 'doc.md')
    registerAtomicFile({ fileId: 'doc', path: target, format: 'markdown', managedContent: 'hello world' })

    const report = await runAtomicWrites('init')

    expect(report.has('doc')).toBe(true)
    const written = await readFile(target, 'utf-8')
    expect(written).toContain('hello world')
  })

  it('dispatches format:"json" files to the JSON writer, not the markdown writer', async () => {
    const target = path.join(dir, 'config.json')
    registerAtomicFile({
      fileId: 'config',
      path: target,
      format: 'json',
      managedContent: JSON.stringify({ a: 1 }),
    })

    const report = await runAtomicWrites('init')

    expect(report.get('config')?.status).toBe('created')
    const written = await readFile(target, 'utf-8')
    expect(written).not.toContain('MCP-GRAPH:MANAGED-START')
    expect(JSON.parse(written)).toMatchObject({ a: 1 })
  })

  it('reports "noop" on a second update with unchanged JSON content', async () => {
    const target = path.join(dir, 'config.json')
    registerAtomicFile({
      fileId: 'config',
      path: target,
      format: 'json',
      managedContent: JSON.stringify({ a: 1 }),
    })

    await runAtomicWrites('init')
    const report = await runAtomicWrites('update')

    expect(report.get('config')?.status).toBe('noop')
  })
})
