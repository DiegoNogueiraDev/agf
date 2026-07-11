/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Guards the generated Windows icon: assets/agf.ico must be a valid multi-resolution
 * ICO carrying the sizes the .exe needs (16/32/48/256). Parses the ICO header directly
 * (zero image deps) so it stays green on any machine.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ICO = join(process.cwd(), 'assets', 'agf.ico')

/** Parse the ICONDIR: [0-1] reserved, [2-3] type=1, [4-5] count, then 16-byte entries. */
function icoSizes(buf: Buffer): number[] {
  expect(buf.readUInt16LE(0)).toBe(0) // reserved
  expect(buf.readUInt16LE(2)).toBe(1) // type = icon
  const count = buf.readUInt16LE(4)
  const sizes: number[] = []
  for (let i = 0; i < count; i++) {
    const w = buf[6 + i * 16]
    sizes.push(w === 0 ? 256 : w) // 0 encodes 256 in the ICO spec
  }
  return sizes.sort((a, b) => a - b)
}

describe('assets/agf.ico — Windows icon', () => {
  it('exists', () => {
    expect(existsSync(ICO)).toBe(true)
  })

  it('is a valid ICO with >=4 images including 256x256', () => {
    const sizes = icoSizes(readFileSync(ICO))
    expect(sizes.length).toBeGreaterThanOrEqual(4)
    expect(sizes).toContain(256)
  })

  it('contains the 16/32/48/256 resolution set', () => {
    const sizes = icoSizes(readFileSync(ICO))
    for (const s of [16, 32, 48, 256]) expect(sizes).toContain(s)
  })
})
