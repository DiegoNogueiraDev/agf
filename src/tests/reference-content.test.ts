import { describe, it, expect } from 'vitest'
import {
  TOOL_TABLE_FULL,
  DEPRECATED_TOOLS_SECTION,
  DOD_SECTION,
  ANALYZE_MODES_SECTION,
} from '../core/config/reference-content.js'

describe('reference-content constants', () => {
  it('TOOL_TABLE_FULL is a non-empty string', () => {
    expect(typeof TOOL_TABLE_FULL).toBe('string')
    expect(TOOL_TABLE_FULL.length).toBeGreaterThan(0)
  })

  it('DEPRECATED_TOOLS_SECTION is a non-empty string', () => {
    expect(typeof DEPRECATED_TOOLS_SECTION).toBe('string')
    expect(DEPRECATED_TOOLS_SECTION.length).toBeGreaterThan(0)
  })

  it('DOD_SECTION is a non-empty string', () => {
    expect(typeof DOD_SECTION).toBe('string')
    expect(DOD_SECTION.length).toBeGreaterThan(0)
  })

  it('ANALYZE_MODES_SECTION is a non-empty string', () => {
    expect(typeof ANALYZE_MODES_SECTION).toBe('string')
    expect(ANALYZE_MODES_SECTION.length).toBeGreaterThan(0)
  })

  it('constants are distinct from each other', () => {
    expect(TOOL_TABLE_FULL).not.toBe(DEPRECATED_TOOLS_SECTION)
    expect(DOD_SECTION).not.toBe(ANALYZE_MODES_SECTION)
  })
})
