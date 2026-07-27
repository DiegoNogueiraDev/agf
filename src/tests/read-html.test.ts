/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/parser/read-html.ts — readHtmlContent.
 */

import { describe, it, expect } from 'vitest'
import { readHtmlContent } from '../core/parser/read-html.js'

describe('readHtmlContent', () => {
  it('converts headings to markdown and keeps body prose', async () => {
    const text = await readHtmlContent('<html><body><h1>Title</h1><p>Hello world</p></body></html>')
    expect(text).toContain('# Title')
    expect(text).toContain('Hello world')
  })

  it('strips script and style content', async () => {
    const text = await readHtmlContent(
      '<html><body><p>Visible</p><script>var secret = 1</script><style>.x{color:red}</style></body></html>',
    )
    expect(text).toContain('Visible')
    expect(text).not.toContain('secret')
    expect(text).not.toContain('color:red')
  })

  it('converts list items to markdown bullets', async () => {
    const text = await readHtmlContent('<html><body><ul><li>alpha</li><li>beta</li></ul></body></html>')
    expect(text).toContain('- alpha')
    expect(text).toContain('- beta')
  })

  it('normalizes whitespace (no runs of 3+ newlines)', async () => {
    const text = await readHtmlContent('<html><body><p>a</p><p>b</p></body></html>')
    expect(text).not.toMatch(/\n{3,}/)
  })
})
