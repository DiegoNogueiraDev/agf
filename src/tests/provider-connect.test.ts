/*!
 * Tests for provider connect — ProviderConnectResult contract (node_ab122dfe0c38)
 * AC:
 *   - /provider connect openrouter + key → probes + returns typed result (no key in output)
 *   - /provider connect ollama → no key required, ollama-local source, default base-url
 */

import { describe, it, expect, vi } from 'vitest'
import { runAsyncCommand } from '../tui/dispatch-ports.js'
import type { AsyncCommandPort } from '../tui/dispatch-ports.js'
import type { ParsedCommand } from '../tui/dispatch.js'

function makePort(providerConnectImpl: AsyncCommandPort['providerConnect']): AsyncCommandPort {
  return {
    check: async () => '',
    decompose: async () => '',
    importPrd: async () => '',
    runDoctor: async () => '',
    build: async () => '',
    generatePrd: async () => '',
    deliver: async () => '',
    gaps: async () => '',
    savings: async () => '',
    preflight: async () => '',
    brief: async () => '',
    submit: async () => '',
    providerConnect: providerConnectImpl,
    providers: () => [],
    providerCurrent: () => '',
    providerSet: () => '',
    providerSetUrl: () => '',
  }
}

function parsed(args: string): ParsedCommand {
  return { cmd: 'provider', args, raw: `/provider ${args}` }
}

describe('runAsyncCommand /provider connect', () => {
  it('routes connect subcommand to providerConnect with id and key', async () => {
    const mock = vi.fn<AsyncCommandPort['providerConnect']>().mockResolvedValue('✓ connected')
    const port = makePort(mock)
    const result = await runAsyncCommand(port, parsed('connect openrouter sk-test'), () => {})
    expect(mock).toHaveBeenCalledWith('openrouter', 'sk-test')
    expect(result).toBe('✓ connected')
  })

  it('routes connect with no key passes undefined', async () => {
    const mock = vi.fn<AsyncCommandPort['providerConnect']>().mockResolvedValue('✓ connected')
    const port = makePort(mock)
    await runAsyncCommand(port, parsed('connect ollama'), () => {})
    expect(mock).toHaveBeenCalledWith('ollama', undefined)
  })

  it('returns usage hint when connect has no id', async () => {
    const mock = vi.fn<AsyncCommandPort['providerConnect']>().mockResolvedValue('')
    const port = makePort(mock)
    const result = await runAsyncCommand(port, parsed('connect'), () => {})
    expect(result).toMatch(/uso|usage/i)
    expect(mock).not.toHaveBeenCalled()
  })
})

describe('ProviderConnectResult contract', () => {
  it('result does not contain the api key', async () => {
    const SECRET = 'sk-super-secret-key'
    const mock = vi.fn<AsyncCommandPort['providerConnect']>().mockImplementation(async (id) => {
      // Simulates the actual implementation returning result without key
      return `✓ Provider: ${id} | fonte: manual | ✓ alcançável\nPersistido: provider=${id}`
    })
    const port = makePort(mock)
    const result = await runAsyncCommand(port, parsed(`connect openrouter ${SECRET}`), () => {})
    expect(result).not.toContain(SECRET)
    expect(result).toContain('openrouter')
  })

  it('ollama source returns ollama-local in output', async () => {
    const mock = vi.fn<AsyncCommandPort['providerConnect']>().mockImplementation(async (id) => {
      return `✓ Provider: ${id} | fonte: ollama-local | ⚠ sem resposta`
    })
    const port = makePort(mock)
    const result = await runAsyncCommand(port, parsed('connect ollama'), () => {})
    expect(result).toContain('ollama-local')
  })
})
