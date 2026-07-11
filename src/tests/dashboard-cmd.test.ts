/*!
 * Task node_bd96df63be50 — agf dashboard command.
 *
 * AC1: Given initialized project, when 'agf dashboard' runs, outputs envelope { ok:true, data:{ url, port } }.
 * AC2: --no-open → browser not opened; url still in envelope.
 * AC3: Reuses startProgressServer/openBrowser (not re-implemented).
 */

import { describe, it, expect } from 'vitest'
import { runDashboardCommand } from '../core/web/dashboard-runner.js'

describe('runDashboardCommand', () => {
  it('returns url and port envelope from the server stub (AC1)', async () => {
    const serverCalls: unknown[] = []
    const browserCalls: string[] = []

    const result = await runDashboardCommand({
      port: 4242,
      noOpen: false,
      startServer: async (port) => {
        serverCalls.push(port)
        return `http://127.0.0.1:${port}`
      },
      openInBrowser: (url) => {
        browserCalls.push(url)
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.port).toBe(4242)
      expect(result.data.url).toBe('http://127.0.0.1:4242')
    }
    expect(serverCalls).toEqual([4242])
    expect(browserCalls).toEqual(['http://127.0.0.1:4242'])
  })

  it('--no-open skips browser but still returns url (AC2)', async () => {
    const browserCalls: string[] = []

    const result = await runDashboardCommand({
      port: 3000,
      noOpen: true,
      startServer: async (port) => `http://127.0.0.1:${port}`,
      openInBrowser: (url) => browserCalls.push(url),
    })

    expect(result.ok).toBe(true)
    expect(browserCalls.length).toBe(0)
    if (result.ok) expect(result.data.url).toBe('http://127.0.0.1:3000')
  })
})
