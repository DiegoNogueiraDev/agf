import { describe, it, expect } from 'vitest'
import type { AtomicFile, AtomicFileMode, WriteResult } from '../core/atomic-files/types.js'

describe('atomic-files types', () => {
  it('AtomicFile has fileId, path, format, managedContent', () => {
    const file: AtomicFile = {
      fileId: 'readme',
      path: 'README.md',
      format: 'markdown',
      managedContent: '# Title',
    }
    expect(file.fileId).toBe('readme')
    expect(file.format).toBe('markdown')
    expect(file.managedContent).toBe('# Title')
  })

  it('AtomicFile accepts json format', () => {
    const file: AtomicFile = {
      fileId: 'config',
      path: 'config.json',
      format: 'json',
      managedContent: '{}',
    }
    expect(file.format).toBe('json')
  })

  it('AtomicFileMode accepts init and update', () => {
    const init: AtomicFileMode = 'init'
    const update: AtomicFileMode = 'update'
    expect(init).toBe('init')
    expect(update).toBe('update')
  })

  it('WriteResult reflects created status', () => {
    const result: WriteResult = { status: 'created' }
    expect(result.status).toBe('created')
    expect(result.backupPath).toBeUndefined()
  })

  it('WriteResult reflects updated status with diff', () => {
    const result: WriteResult = { status: 'updated', diff: '- old\n+ new' }
    expect(result.status).toBe('updated')
    expect(result.diff).toContain('old')
  })

  it('WriteResult reflects preserved_external with tampered flag', () => {
    const result: WriteResult = { status: 'preserved_external', tampered: true }
    expect(result.tampered).toBe(true)
  })

  it('WriteResult reflects noop (no-operation)', () => {
    const result: WriteResult = { status: 'noop' }
    expect(result.status).toBe('noop')
  })
})
