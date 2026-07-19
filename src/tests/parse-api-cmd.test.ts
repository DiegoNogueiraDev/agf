/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/parse-api-cmd.ts — wires parseSwaggerContent
 * /parseWsdlContent (node_wire_8d6e35333592), which had zero real callers
 * despite being a complete, tested 421-line OpenAPI/WSDL parser.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseApiCommand } from '../cli/commands/parse-api-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await parseApiCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf parse-api (node_wire_8d6e35333592)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('parses a real OpenAPI 3.0 JSON file into structured endpoints', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-parse-api-'))
    const file = join(dir, 'spec.json')
    writeFileSync(
      file,
      JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Widgets API', version: '1.0.0' },
        paths: {
          '/widgets': {
            get: { operationId: 'listWidgets', summary: 'List widgets', responses: { '200': { description: 'ok' } } },
          },
        },
      }),
    )

    const result = await run([file])
    expect(result.ok).toBe(true)
    const data = result.data as { title: string; format: string; endpoints: Array<{ operationId: string }> }
    expect(data.title).toBe('Widgets API')
    expect(data.format).toBe('openapi3')
    expect(data.endpoints).toHaveLength(1)
    expect(data.endpoints[0].operationId).toBe('listWidgets')
  })

  it('parses a real WSDL file by .wsdl extension', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-parse-wsdl-'))
    const file = join(dir, 'service.wsdl')
    writeFileSync(
      file,
      `<?xml version="1.0"?>
<definitions name="WidgetService">
  <portType name="WidgetPort">
    <operation name="GetWidget"></operation>
  </portType>
</definitions>`,
    )

    const result = await run([file])
    expect(result.ok).toBe(true)
    const data = result.data as { title: string; format: string; endpoints: Array<{ operationId: string }> }
    expect(data.title).toBe('WidgetService')
    expect(data.format).toBe('wsdl')
    expect(data.endpoints[0].operationId).toBe('GetWidget')
  })

  it('returns PARSE_FAILED for unrecognized content', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-parse-bad-'))
    const file = join(dir, 'garbage.json')
    writeFileSync(file, '{"not":"a spec"}')

    const result = await run([file])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('PARSE_FAILED')
  })
})
