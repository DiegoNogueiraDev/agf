import { describe, it, expect } from 'vitest'
import {
  DEFAULT_NODE_STATUS,
  DEFAULT_NODE_PRIORITY,
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_CHUNK_MAX_TOKENS,
  DEFAULT_CHUNK_OVERLAP,
  isLanguageSupported,
  SUPPORTED_LANGUAGES,
  BOOTSTRAP_TOOLS,
  UCR_CONFIDENCE_THRESHOLD,
} from '../core/utils/constants.js'

describe('constants', () => {
  it('DEFAULT_NODE_STATUS is backlog', () => {
    expect(DEFAULT_NODE_STATUS).toBe('backlog')
  })

  it('DEFAULT_NODE_PRIORITY is 3', () => {
    expect(DEFAULT_NODE_PRIORITY).toBe(3)
  })

  it('DEFAULT_TOKEN_BUDGET is positive', () => {
    expect(DEFAULT_TOKEN_BUDGET).toBeGreaterThan(0)
  })

  it('DEFAULT_CHUNK_MAX_TOKENS is positive', () => {
    expect(DEFAULT_CHUNK_MAX_TOKENS).toBeGreaterThan(0)
  })

  it('DEFAULT_CHUNK_OVERLAP is less than DEFAULT_CHUNK_MAX_TOKENS', () => {
    expect(DEFAULT_CHUNK_OVERLAP).toBeLessThan(DEFAULT_CHUNK_MAX_TOKENS)
  })

  it('UCR_CONFIDENCE_THRESHOLD is between 0 and 1', () => {
    expect(UCR_CONFIDENCE_THRESHOLD).toBeGreaterThan(0)
    expect(UCR_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(1)
  })

  it('BOOTSTRAP_TOOLS is a non-empty Set', () => {
    expect(BOOTSTRAP_TOOLS.size).toBeGreaterThan(0)
  })
})

describe('isLanguageSupported', () => {
  it('returns true for a supported language', () => {
    expect(isLanguageSupported(SUPPORTED_LANGUAGES[0])).toBe(true)
  })

  it('returns false for an unsupported language', () => {
    expect(isLanguageSupported('klingon')).toBe(false)
  })
})
