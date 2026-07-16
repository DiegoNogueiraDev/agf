import { describe, it, expect, beforeEach } from 'vitest'

async function importEvents() {
  return await import('../tui/browser-events.js')
}

describe('BrowserEvents', () => {
  beforeEach(async () => {
    const { clearBrowserEvents } = await importEvents()
    clearBrowserEvents()
  })

  it('emite e lista eventos', async () => {
    const { emitBrowserEvent, listBrowserEvents } = await importEvents()
    emitBrowserEvent({ action: 'info', args: '', result: '{"url":"x"}', durationMs: 10, sessionId: 's1' })
    const all = listBrowserEvents()
    expect(all).toHaveLength(1)
    expect(all[0].action).toBe('info')
    expect(all[0].at).toBeGreaterThan(0)
  })

  it('filtra eventos por string', async () => {
    const { emitBrowserEvent, listBrowserEvents } = await importEvents()
    emitBrowserEvent({ action: 'goto', args: 'https://a.com', result: 'ok', durationMs: 5, sessionId: 's1' })
    emitBrowserEvent({ action: 'info', args: '', result: '{}', durationMs: 3, sessionId: 's1' })
    const filtered = listBrowserEvents('goto')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].action).toBe('goto')
  })

  it('limita a 500 eventos', async () => {
    const { emitBrowserEvent, listBrowserEvents } = await importEvents()
    for (let i = 0; i < 550; i++) {
      emitBrowserEvent({ action: 'goto', args: `url-${i}`, result: 'ok', durationMs: 1, sessionId: 's1' })
    }
    const all = listBrowserEvents()
    expect(all.length).toBeLessThanOrEqual(500)
  })
})
