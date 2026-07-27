/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { createNlVerify } from '../core/economy/lossy-gate.js'

function nlStr(n = 600): string {
  return 'x'.repeat(n)
}

describe('createNlVerify', () => {
  it('preserves URLs', async () => {
    const verify = createNlVerify()
    const orig = `the url is https://example.com/path?q=1 and more text ${nlStr()}`
    const cand = `url https://example.com/path?q=1 text ${nlStr(200)}`
    const result = await verify(orig, cand)
    expect(result).toBe(true)
  })

  it('reverts when URL is removed', async () => {
    const verify = createNlVerify()
    const orig = `visit https://example.com for more ${nlStr()}`
    const cand = `visit site for more ${nlStr(200)}`
    const result = await verify(orig, cand)
    expect(result).toBe(false)
  })

  it('preserves all email addresses', async () => {
    const verify = createNlVerify()
    const orig = `emails: user@example.com and admin@test.org ${nlStr()}`
    const cand = `emails: user@example.com and admin@test.org ${nlStr(200)}`
    const result = await verify(orig, cand)
    expect(result).toBe(true)
  })

  it('reverts when email is dropped', async () => {
    const verify = createNlVerify()
    const orig = `contact us at support@company.com ${nlStr()}`
    const cand = `contact us ${nlStr(200)}`
    const result = await verify(orig, cand)
    expect(result).toBe(false)
  })

  it('preserves numbers above threshold', async () => {
    const verify = createNlVerify()
    const orig = `port 8080 needs 2048 bytes ${nlStr()}`
    const cand = `port 8080 needs 2048 bytes ${nlStr(200)}`
    const result = await verify(orig, cand)
    expect(result).toBe(true)
  })

  it('reverts when numbers are changed', async () => {
    const verify = createNlVerify()
    const orig = `timeout value 30000 required ${nlStr()}`
    const cand = `timeout value 5000 required ${nlStr(200)}`
    const result = await verify(orig, cand)
    expect(result).toBe(false)
  })

  it('preserves code fences', async () => {
    const verify = createNlVerify()
    const orig = `code:\n\`\`\`\nconst x = 1\n\`\`\`\n${nlStr()}`
    const cand = `code:\n\`\`\`\nconst x = 1\n\`\`\`\n${nlStr(200)}`
    const result = await verify(orig, cand)
    expect(result).toBe(true)
  })

  it('reverts when code fence is removed', async () => {
    const verify = createNlVerify()
    const orig = `example:\n\`\`\`\nconst x = 1\n\`\`\`\n${nlStr()}`
    const cand = `example:\n${nlStr(200)}`
    const result = await verify(orig, cand)
    expect(result).toBe(false)
  })

  it('preserves dates and times', async () => {
    const verify = createNlVerify()
    const orig = `date 2024-01-15 time 14:30:00 ${nlStr()}`
    const cand = `date 2024-01-15 time 14:30:00 ${nlStr(200)}`
    const result = await verify(orig, cand)
    expect(result).toBe(true)
  })

  it('allows compression of pure text without entities', async () => {
    const verify = createNlVerify()
    const orig = nlStr(600)
    const cand = 'compressed version'
    const result = await verify(orig, cand)
    expect(result).toBe(true)
  })
})
