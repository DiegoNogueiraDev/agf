import { describe, it, expect, vi } from 'vitest'
import type { LiveRunner } from '../tui/live-runner.js'

describe('LiveRunner interface contract', () => {
  it('mock LiveRunner.run retorna summary string', async () => {
    const mock: LiveRunner = {
      autopilot: vi.fn().mockResolvedValue('Resumo: 1 concluída'),
      run: vi.fn().mockResolvedValue('✓ verde'),
    }
    const result = await mock.run('test prompt', vi.fn())
    expect(result).toBe('✓ verde')
  })

  it('mock LiveRunner.autopilot retorna summary', async () => {
    const mock: LiveRunner = {
      autopilot: vi.fn().mockResolvedValue('Resumo: 3 concluídas'),
      run: vi.fn(),
    }
    const result = await mock.autopilot(5, vi.fn(), new AbortController().signal)
    expect(result).toContain('3')
  })

  it('abort controller cancela autopilot', async () => {
    const signal = new AbortController().signal
    const mock: LiveRunner = {
      autopilot: vi.fn(async (_max, _onLine, s) => {
        if (s.aborted) return 'interrompido'
        return 'completo'
      }),
      run: vi.fn(),
    }
    const controller = new AbortController()
    controller.abort()
    const result = await mock.autopilot(5, vi.fn(), controller.signal)
    expect(result).toBe('interrompido')
  })
})
