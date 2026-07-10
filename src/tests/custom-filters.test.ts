import { describe, it, expect, afterEach } from 'vitest'
import { compileCustomFilter, _resetCustomFiltersLoaded, withTokenAudit } from '../core/tool-compress/custom-filters.js'
import { getLogBuffer, clearLogBuffer } from '../core/utils/logger.js'

describe('compileCustomFilter', () => {
  it('returns a function (CompressFilter) for valid rule', () => {
    const filter = compileCustomFilter({ name: 'test-filter', detect: ['ERROR'] })
    expect(typeof filter).toBe('object')
  })

  it('throws when name is missing', () => {
    expect(() => compileCustomFilter({ name: '', detect: ['x'] })).toThrow()
  })

  it('throws when detect array is empty', () => {
    expect(() => compileCustomFilter({ name: 'f', detect: [] })).toThrow()
  })

  it('creates filter with the given name', () => {
    const filter = compileCustomFilter({ name: 'my-filter', detect: ['WARN'] })
    expect(filter.name).toBe('my-filter')
  })
})

describe('_resetCustomFiltersLoaded', () => {
  it('is a function', () => {
    expect(typeof _resetCustomFiltersLoaded).toBe('function')
  })

  it('does not throw when called', () => {
    expect(() => _resetCustomFiltersLoaded()).not.toThrow()
  })

  it('can be called multiple times without error', () => {
    _resetCustomFiltersLoaded()
    _resetCustomFiltersLoaded()
  })
})

describe('withTokenAudit (node_wire_16a06f4fe66d — tokenizer-feedback-audit wire)', () => {
  afterEach(() => {
    clearLogBuffer()
  })

  it('warns once when a custom filter inflates real output tokens', () => {
    clearLogBuffer()
    const inflating = compileCustomFilter({ name: 'bloat-filter', detect: ['x'] })
    const audited = withTokenAudit(inflating)

    const longInput = 'short'
    // apply() on a rule with no keep/drop passes text through unchanged —
    // wrap it so the "compressed" text is artificially longer to simulate inflation.
    const forcedInflate = { ...audited, apply: (text: string) => audited.apply(text) + ' extra padding words here' }
    forcedInflate.apply(longInput)
    forcedInflate.apply(longInput)

    const warnings = getLogBuffer().filter((e) => e.level === 'warn' && e.message === 'custom-filter-inflates-tokens')
    expect(warnings.length).toBe(1)
  })

  it('does not warn for a filter that genuinely reduces tokens', () => {
    clearLogBuffer()
    const shrinking = {
      name: 'shrink-filter',
      priority: 60,
      detect: () => true,
      apply: () => 'x',
    }
    const audited = withTokenAudit(shrinking)
    audited.apply('a very long original piece of text with many words to compress down')

    const warnings = getLogBuffer().filter((e) => e.level === 'warn' && e.message === 'custom-filter-inflates-tokens')
    expect(warnings.length).toBe(0)
  })
})
