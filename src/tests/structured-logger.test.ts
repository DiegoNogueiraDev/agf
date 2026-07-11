import { describe, it, expect, vi } from 'vitest'
import { StructuredLogger } from '../core/errors/structured-logger.js'

describe('StructuredLogger', () => {
  it('creates an instance without throwing', () => {
    expect(() => new StructuredLogger('test-service')).not.toThrow()
  })

  it('accepts a layer parameter', () => {
    expect(() => new StructuredLogger('my-service', 'core')).not.toThrow()
  })

  it('info method does not throw', () => {
    const logger = new StructuredLogger('test-svc')
    expect(() => logger.info('test message')).not.toThrow()
  })

  it('warn method does not throw', () => {
    const logger = new StructuredLogger('test-svc')
    expect(() => logger.warn('warning message')).not.toThrow()
  })

  it('error method does not throw', () => {
    const logger = new StructuredLogger('test-svc')
    expect(() => logger.error('error message')).not.toThrow()
  })

  it('debug method does not throw', () => {
    const logger = new StructuredLogger('test-svc')
    expect(() => logger.debug('debug message')).not.toThrow()
  })

  it('success method does not throw', () => {
    const logger = new StructuredLogger('test-svc')
    expect(() => logger.success('success message')).not.toThrow()
  })

  it('accepts context object', () => {
    const logger = new StructuredLogger('test-svc')
    expect(() => logger.info('msg', { key: 'value', count: 42 })).not.toThrow()
  })

  it('error method accepts structured context', () => {
    const logger = new StructuredLogger('test-svc')
    expect(() => logger.error('error', { kind: 'validation', operation: 'parse' })).not.toThrow()
  })

  it('is an instance of StructuredLogger', () => {
    const logger = new StructuredLogger('svc')
    expect(logger).toBeInstanceOf(StructuredLogger)
  })
})
