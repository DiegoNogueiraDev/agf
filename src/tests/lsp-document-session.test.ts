/*!
 * Tests for src/core/lsp/lsp-document-session.ts
 * Verifies didOpen tracking, version increment, and idempotent open.
 */

import { describe, it, expect, vi } from 'vitest'
import { LspDocumentSession } from '../core/lsp/lsp-document-session.js'

function makeClient() {
  return { sendNotification: vi.fn() }
}

describe('LspDocumentSession', () => {
  it('sends didOpen notification on first open', () => {
    const session = new LspDocumentSession()
    const client = makeClient()
    const content = 'const x = 1\n'
    session.ensureDocumentOpen(client, 'file:///foo.ts', 'typescript', content)
    expect(client.sendNotification).toHaveBeenCalledOnce()
    expect(client.sendNotification).toHaveBeenCalledWith(
      'textDocument/didOpen',
      expect.objectContaining({ textDocument: expect.objectContaining({ uri: 'file:///foo.ts', version: 1 }) }),
    )
  })

  it('does NOT send didOpen again for the same URI', () => {
    const session = new LspDocumentSession()
    const client = makeClient()
    session.ensureDocumentOpen(client, 'file:///foo.ts', 'typescript', 'content')
    session.ensureDocumentOpen(client, 'file:///foo.ts', 'typescript', 'content')
    expect(client.sendNotification).toHaveBeenCalledOnce()
  })

  it('sends didChange and increments version', () => {
    const session = new LspDocumentSession()
    const client = makeClient()
    session.ensureDocumentOpen(client, 'file:///foo.ts', 'typescript', 'v1')
    session.notifyDocumentChanged(client, 'file:///foo.ts', 'v2')
    expect(client.sendNotification).toHaveBeenCalledTimes(2)
    const changeCall = client.sendNotification.mock.calls[1]
    expect(changeCall[0]).toBe('textDocument/didChange')
    expect(changeCall[1].textDocument.version).toBe(2)
    expect(changeCall[1].contentChanges[0].text).toBe('v2')
  })

  it('getVersion returns current version', () => {
    const session = new LspDocumentSession()
    const client = makeClient()
    session.ensureDocumentOpen(client, 'file:///foo.ts', 'typescript', 'v1')
    expect(session.getVersion('file:///foo.ts')).toBe(1)
    session.notifyDocumentChanged(client, 'file:///foo.ts', 'v2')
    expect(session.getVersion('file:///foo.ts')).toBe(2)
  })

  it('isOpen returns true only after first ensureDocumentOpen', () => {
    const session = new LspDocumentSession()
    const client = makeClient()
    expect(session.isOpen('file:///bar.ts')).toBe(false)
    session.ensureDocumentOpen(client, 'file:///bar.ts', 'typescript', 'x')
    expect(session.isOpen('file:///bar.ts')).toBe(true)
  })
})
