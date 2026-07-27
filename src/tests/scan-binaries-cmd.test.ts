/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * TDD: agf scan-binaries check-served (node_wire_4898e9da47e2 — release-consistency wire).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanBinariesCommand } from '../cli/commands/scan-binaries-cmd.js'

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await scanBinariesCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf scan-binaries check-served (node_wire_4898e9da47e2 — release-consistency wire)', () => {
  let server: Server
  let dir: string
  let baseUrl: string

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports ok=true when the served bytes match BUILDINFO sha256', async () => {
    const goodBytes = Buffer.from('real-binary-content')
    const goodSha = createHash('sha256').update(goodBytes).digest('hex')

    server = createServer((req, res) => {
      res.end(goodBytes)
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as { port: number }).port
    baseUrl = `http://127.0.0.1:${port}`

    dir = mkdtempSync(join(tmpdir(), 'agf-scan-served-'))
    writeFileSync(
      join(dir, 'BUILDINFO'),
      JSON.stringify({ version: '1.2.3', targets: [{ out: 'agf-linux-x64', sha256: goodSha }] }),
    )

    const result = await run(['check-served', '--build-info', join(dir, 'BUILDINFO'), '--base-url', baseUrl])
    expect(result.ok).toBe(true)
    const data = result.data as { ok: boolean; divergent: string[]; missing: string[] }
    expect(data.ok).toBe(true)
    expect(data.divergent).toEqual([])
    expect(data.missing).toEqual([])
  })

  it('reports ok=false and lists the divergent asset when the served CDN edge is stale', async () => {
    const staleBytes = Buffer.from('OLD-stale-binary')
    const expectedSha = createHash('sha256').update(Buffer.from('NEW-real-binary')).digest('hex')

    server = createServer((req, res) => {
      res.end(staleBytes)
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as { port: number }).port
    baseUrl = `http://127.0.0.1:${port}`

    dir = mkdtempSync(join(tmpdir(), 'agf-scan-served-stale-'))
    writeFileSync(
      join(dir, 'BUILDINFO'),
      JSON.stringify({ version: '1.2.3', targets: [{ out: 'agf-windows-x64.exe', sha256: expectedSha }] }),
    )

    const result = await run(['check-served', '--build-info', join(dir, 'BUILDINFO'), '--base-url', baseUrl])
    expect(result.ok).toBe(true) // command itself succeeded; the gate result is in data.ok
    const data = result.data as { ok: boolean; divergent: string[] }
    expect(data.ok).toBe(false)
    expect(data.divergent).toEqual(['agf-windows-x64.exe'])
  })
})
