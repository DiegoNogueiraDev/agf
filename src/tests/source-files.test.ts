/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReaddir = vi.fn()

vi.mock('node:fs/promises', () => ({
  readdir: mockReaddir,
}))

describe('hasSourceFiles', () => {
  beforeEach(() => {
    mockReaddir.mockReset()
  })

  it('should return true when directory contains .ts files', async () => {
    mockReaddir.mockResolvedValue([{ name: 'index.ts', isFile: () => true }])
    const { hasSourceFiles } = await import('../core/utils/source-files.js')
    await expect(hasSourceFiles('/some/dir')).resolves.toBe(true)
  })

  it('should return true when directory contains .go files', async () => {
    mockReaddir.mockResolvedValue([{ name: 'main.go', isFile: () => true }])
    const { hasSourceFiles } = await import('../core/utils/source-files.js')
    await expect(hasSourceFiles('/some/dir')).resolves.toBe(true)
  })

  it('should return false when directory has no source files', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'readme.md', isFile: () => true },
      { name: 'data.json', isFile: () => true },
    ])
    const { hasSourceFiles } = await import('../core/utils/source-files.js')
    await expect(hasSourceFiles('/some/dir')).resolves.toBe(false)
  })

  it('should return false when directory has only subdirectories', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'node_modules', isFile: () => false },
      { name: 'dist', isFile: () => false },
    ])
    const { hasSourceFiles } = await import('../core/utils/source-files.js')
    await expect(hasSourceFiles('/some/dir')).resolves.toBe(false)
  })

  it('should return false when readdir throws', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'))
    const { hasSourceFiles } = await import('../core/utils/source-files.js')
    await expect(hasSourceFiles('/nonexistent')).resolves.toBe(false)
  })
})
