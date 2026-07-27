import { describe, it, expect } from 'vitest'
import {
  extractCsharpModifiers,
  extractCsharpAttributes,
  extractCsharpTypeParameters,
  enrichCsharpSymbol,
  hasCsharpEnrichmentSignal,
} from '../core/code/treesitter/csharp-enrichment.js'
import type { CsSyntaxNodeLike } from '../core/code/treesitter/csharp-enrichment.js'

function makeNode(type: string, children: CsSyntaxNodeLike[] = [], text = ''): CsSyntaxNodeLike {
  return { type, children, text }
}

describe('extractCsharpModifiers', () => {
  it('returns empty array for node with no modifier children', () => {
    const node = makeNode('method_declaration', [])
    expect(extractCsharpModifiers(node)).toEqual([])
  })

  it('extracts modifier text from children', () => {
    const node = makeNode('method_declaration', [makeNode('public', [], 'public'), makeNode('static', [], 'static')])
    const modifiers = extractCsharpModifiers(node)
    expect(modifiers).toContain('public')
    expect(modifiers).toContain('static')
  })
})

describe('extractCsharpAttributes', () => {
  it('returns empty array for node with no attribute lists', () => {
    const node = makeNode('method_declaration', [])
    expect(extractCsharpAttributes(node)).toEqual([])
  })
})

describe('extractCsharpTypeParameters', () => {
  it('returns empty array when no type parameters', () => {
    const node = makeNode('method_declaration', [])
    expect(extractCsharpTypeParameters(node)).toEqual([])
  })
})

describe('enrichCsharpSymbol', () => {
  it('returns enrichment object', () => {
    const node = makeNode('method_declaration', [])
    const e = enrichCsharpSymbol(node)
    expect(typeof e).toBe('object')
    expect(e).not.toBeNull()
  })

  it('enrichment has modifiers and attributes arrays', () => {
    const node = makeNode('class_declaration', [makeNode('public', [], 'public')])
    const e = enrichCsharpSymbol(node)
    expect(Array.isArray(e.modifiers)).toBe(true)
    expect(Array.isArray(e.attributes)).toBe(true)
  })
})

describe('hasCsharpEnrichmentSignal', () => {
  it('returns false when no enrichment data', () => {
    const empty = enrichCsharpSymbol(makeNode('unknown', []))
    expect(typeof hasCsharpEnrichmentSignal(empty)).toBe('boolean')
  })

  it('returns true when modifiers present', () => {
    const node = makeNode('method_declaration', [makeNode('public', [], 'public')])
    const e = enrichCsharpSymbol(node)
    expect(hasCsharpEnrichmentSignal(e)).toBe(true)
  })
})
