/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_bb8eb03a305c — Fix console.warn in progress-html.ts:99 — use logger
 * AC: GIVEN progress-html.ts WHEN colony-health poll fails
 *     THEN uses log.warn not console.warn; errors dim 80→82
 */
import { describe, it, expect } from 'vitest'
import { renderProgressHtml } from '../core/web/progress-html.js'

describe('progress-html — error handling (AC: no console.warn leaks)', () => {
  it('does not contain console.warn in rendered HTML', () => {
    const html = renderProgressHtml()
    expect(html).not.toContain('console.warn')
  })

  it('uses log.warn consistently in all catch blocks', () => {
    const html = renderProgressHtml()
    const matches = [...html.matchAll(/catch\s*\(e\)\s*\{([^}]+)\}/g)]
    for (const m of matches) {
      expect(m[1]).not.toMatch(/console\.(warn|error|log)/)
    }
  })
})
