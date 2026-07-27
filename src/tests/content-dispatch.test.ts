import { describe, it, expect } from 'vitest'
import { detectContentType } from '../core/economy/content-dispatch.js'

describe('detectContentType', () => {
  it('detects JSON object', () => {
    expect(detectContentType('{"key": "value"}')).toBe('json')
  })

  it('detects JSON array', () => {
    expect(detectContentType('[1, 2, 3]')).toBe('json')
  })

  it('returns text for invalid JSON starting with {', () => {
    expect(detectContentType('{ not valid json')).toBe('text')
  })

  it('detects code via import statement', () => {
    expect(detectContentType('import { foo } from "./bar.js"')).toBe('code')
  })

  it('detects code via function declaration', () => {
    expect(detectContentType('function hello() { return 1 }')).toBe('code')
  })

  it('detects code via export keyword', () => {
    expect(detectContentType('export const x = 1')).toBe('code')
  })

  it('returns text for plain prose', () => {
    expect(detectContentType('This is just some regular text about things.')).toBe('text')
  })

  it('returns text for empty string', () => {
    expect(detectContentType('')).toBe('text')
  })

  it('returns text for whitespace only', () => {
    expect(detectContentType('   \n  ')).toBe('text')
  })
})
