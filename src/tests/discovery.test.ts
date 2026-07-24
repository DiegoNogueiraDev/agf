/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/plugins/browser/discovery.ts — discoverCdpUrl.
 */

import { describe, it, expect } from 'vitest'
import { discoverCdpUrl } from '../plugins/browser/discovery.js'

const GUID = '00000000000000000000000000000000'

describe('discoverCdpUrl', () => {
  it('returns customUrl verbatim when provided', () => {
    expect(discoverCdpUrl({ customUrl: 'ws://example/devtools' })).toBe('ws://example/devtools')
  })

  it('builds a ws url from an explicit customPort', () => {
    expect(discoverCdpUrl({ customPort: 9333 })).toBe(`ws://127.0.0.1:9333/devtools/browser/${GUID}`)
  })

  it('customUrl takes precedence over customPort', () => {
    expect(discoverCdpUrl({ customUrl: 'ws://override', customPort: 9333 })).toBe('ws://override')
  })

  it('falls back to a local devtools ws url when no options are given', () => {
    const url = discoverCdpUrl()
    expect(url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//)
  })
})
