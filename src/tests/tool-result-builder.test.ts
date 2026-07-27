import { describe, it, expect } from 'vitest'
import { ToolResultBuilder } from '../tui/slash/tool-result-builder.js'

describe('ToolResultBuilder', () => {
  describe('text()', () => {
    it('sets type to text and stores content', () => {
      const result = new ToolResultBuilder().text('hello').display()
      expect(result.type).toBe('text')
      expect(result.content).toBe('hello')
    })

    it('returns this for chaining', () => {
      const builder = new ToolResultBuilder()
      expect(builder.text('x')).toBe(builder)
    })

    it('clears dataValue from previous data()', () => {
      const result = new ToolResultBuilder().data({ x: 1 }).text('hello').display()
      expect(result.type).toBe('text')
      expect(result.content).toBe('hello')
      expect(result.data).toBeUndefined()
    })
  })

  describe('error()', () => {
    it('sets type to error with content', () => {
      const result = new ToolResultBuilder().error('something broke').display()
      expect(result.type).toBe('error')
      expect(result.content).toBe('something broke')
    })

    it('includes stderr when provided', () => {
      const result = new ToolResultBuilder().error('fail', { stderr: 'trace\nline2' }).display()
      expect(result.content).toContain('stderr:')
      expect(result.content).toContain('trace')
      expect(result.content).toContain('line2')
    })

    it('includes exit code when provided', () => {
      const result = new ToolResultBuilder().error('fail', { exitCode: 1 }).display()
      expect(result.content).toContain('exit code: 1')
    })

    it('includes both stderr and exit code', () => {
      const result = new ToolResultBuilder().error('fail', { stderr: 'err', exitCode: 2 }).display()
      expect(result.content).toContain('stderr:')
      expect(result.content).toContain('err')
      expect(result.content).toContain('exit code: 2')
    })

    it('returns this for chaining', () => {
      const builder = new ToolResultBuilder()
      expect(builder.error('x')).toBe(builder)
    })
  })

  describe('data()', () => {
    it('sets type to data with raw value', () => {
      const value = { id: 'n1', title: 'test' }
      const result = new ToolResultBuilder().data(value).display()
      expect(result.type).toBe('data')
      expect(result.data).toEqual(value)
      expect(result.content).toBeUndefined()
    })

    it('returns this for chaining', () => {
      const builder = new ToolResultBuilder()
      expect(builder.data({})).toBe(builder)
    })
  })

  describe('tail()', () => {
    it('keeps last N lines', () => {
      const content = 'line1\nline2\nline3\nline4\nline5'
      const builder = new ToolResultBuilder().text(content).tail(2)
      const result = builder.display()
      expect(result.content).toBe('line4\nline5')
    })

    it('preserves all lines when N >= total lines', () => {
      const content = 'a\nb\nc'
      const result = new ToolResultBuilder().text(content).tail(5).display()
      expect(result.content).toBe(content)
    })

    it('handles single line', () => {
      const result = new ToolResultBuilder().text('only').tail(1).display()
      expect(result.content).toBe('only')
    })

    it('returns this for chaining', () => {
      const builder = new ToolResultBuilder().text('x')
      expect(builder.tail(1)).toBe(builder)
    })
  })

  describe('extras()', () => {
    it('appends context lines after content', () => {
      const result = new ToolResultBuilder().text('main').extras(['extra1', 'extra2']).display()
      expect(result.content).toBe('main\nextra1\nextra2')
    })

    it('works with empty extras', () => {
      const result = new ToolResultBuilder().text('main').extras([]).display()
      expect(result.content).toBe('main')
    })

    it('can be called multiple times', () => {
      const result = new ToolResultBuilder().text('main').extras(['a']).extras(['b']).display()
      expect(result.content).toBe('main\na\nb')
    })

    it('returns this for chaining', () => {
      const builder = new ToolResultBuilder().text('x')
      expect(builder.extras(['y'])).toBe(builder)
    })
  })

  describe('display()', () => {
    it('defaults to text type with empty content', () => {
      const result = new ToolResultBuilder().display()
      expect(result.type).toBe('text')
      expect(result.content).toBe('')
    })

    it('truncates content exceeding line limit', () => {
      const lines: string[] = []
      for (let i = 0; i < 5; i++) lines.push(`line${i}`)
      const builder = new ToolResultBuilder({ lineLimit: 3 })
      const result = builder.text(lines.join('\n')).display()
      expect(result.content).toContain('line0')
      expect(result.content).toContain('line2')
      expect(result.content).toContain('...')
    })

    it('truncates content exceeding char limit', () => {
      const builder = new ToolResultBuilder({ charLimit: 10 })
      const result = builder.text('hello world long text').display()
      expect(result.content!.length).toBeLessThanOrEqual(13)
      expect(result.content).toContain('...')
    })

    it('applies both line and char limits', () => {
      const builder = new ToolResultBuilder({ lineLimit: 2, charLimit: 20 })
      const content = 'a long line that should be truncated\nanother line\nthird line'
      const result = builder.text(content).display()
      expect(result.content).toMatch(/\.\.\./)
    })

    it('does not truncate content within limits', () => {
      const result = new ToolResultBuilder({ charLimit: 1000, lineLimit: 100 }).text('short').display()
      expect(result.content).toBe('short')
    })
  })

  describe('default limits', () => {
    it('uses 100K char limit by default', () => {
      const builder = new ToolResultBuilder()
      expect(builder.charLimit).toBe(100_000)
      expect(builder.lineLimit).toBe(1000)
    })

    it('accepts custom limits', () => {
      const builder = new ToolResultBuilder({ charLimit: 50, lineLimit: 5 })
      expect(builder.charLimit).toBe(50)
      expect(builder.lineLimit).toBe(5)
    })
  })

  describe('method chaining', () => {
    it('supports full fluent chain', () => {
      const result = new ToolResultBuilder().text('error occurred').extras(['context: processing']).tail(5).display()
      expect(result.type).toBe('text')
      expect(result.content).toContain('error occurred')
    })
  })
})
