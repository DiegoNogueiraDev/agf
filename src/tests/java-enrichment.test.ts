import { describe, it, expect } from 'vitest'
import {
  extractAnnotations,
  extractModifiers,
  extractTypeParameters,
  extractThrowsClause,
  enrichJavaSymbol,
  hasJavaEnrichmentSignal,
  type JavaSyntaxNodeLike,
} from '../core/code/treesitter/java-enrichment.js'

function makeNode(overrides: Partial<JavaSyntaxNodeLike> & { type: string }): JavaSyntaxNodeLike {
  return { children: [], namedChildren: [], ...overrides }
}

describe('extractAnnotations', () => {
  it('returns empty when no modifiers node', () => {
    expect(extractAnnotations(makeNode({ type: 'method_declaration' }))).toEqual([])
  })

  it('extracts marker_annotation text', () => {
    const ann: JavaSyntaxNodeLike = { type: 'marker_annotation', text: '@Override' }
    const mods: JavaSyntaxNodeLike = { type: 'modifiers', namedChildren: [ann], children: [] }
    const node: JavaSyntaxNodeLike = {
      type: 'method_declaration',
      childForFieldName: (name) => (name === 'modifiers' ? mods : null),
    }
    expect(extractAnnotations(node)).toEqual(['@Override'])
  })

  it('extracts annotation text', () => {
    const ann: JavaSyntaxNodeLike = { type: 'annotation', text: '@SuppressWarnings("unchecked")' }
    const mods: JavaSyntaxNodeLike = { type: 'modifiers', namedChildren: [ann], children: [] }
    const node: JavaSyntaxNodeLike = {
      type: 'class_declaration',
      namedChildren: [mods],
    }
    expect(extractAnnotations(node)).toEqual(['@SuppressWarnings("unchecked")'])
  })

  it('ignores non-annotation children', () => {
    const child: JavaSyntaxNodeLike = { type: 'public', text: 'public' }
    const mods: JavaSyntaxNodeLike = { type: 'modifiers', namedChildren: [child], children: [] }
    const node: JavaSyntaxNodeLike = {
      type: 'method_declaration',
      namedChildren: [mods],
    }
    expect(extractAnnotations(node)).toEqual([])
  })
})

describe('extractModifiers', () => {
  it('returns empty when no modifiers node', () => {
    expect(extractModifiers(makeNode({ type: 'method_declaration' }))).toEqual([])
  })

  it('extracts known modifier tokens', () => {
    const pub: JavaSyntaxNodeLike = { type: 'public' }
    const stat: JavaSyntaxNodeLike = { type: 'static' }
    const fin: JavaSyntaxNodeLike = { type: 'final' }
    const mods: JavaSyntaxNodeLike = { type: 'modifiers', children: [pub, stat, fin], namedChildren: [] }
    const node: JavaSyntaxNodeLike = {
      type: 'method_declaration',
      childForFieldName: (name) => (name === 'modifiers' ? mods : null),
    }
    expect(extractModifiers(node)).toEqual(['public', 'static', 'final'])
  })

  it('skips unknown tokens', () => {
    const unknown: JavaSyntaxNodeLike = { type: 'some_unknown_token' }
    const mods: JavaSyntaxNodeLike = { type: 'modifiers', children: [unknown], namedChildren: [] }
    const node: JavaSyntaxNodeLike = {
      type: 'method_declaration',
      namedChildren: [mods],
    }
    expect(extractModifiers(node)).toEqual([])
  })
})

describe('extractTypeParameters', () => {
  it('returns empty when no type_parameters field', () => {
    expect(extractTypeParameters(makeNode({ type: 'method_declaration' }))).toEqual([])
  })

  it('extracts type_parameter nodes verbatim', () => {
    const t: JavaSyntaxNodeLike = { type: 'type_parameter', text: 'T extends Comparable<T>' }
    const params: JavaSyntaxNodeLike = { type: 'type_parameters', namedChildren: [t] }
    const node: JavaSyntaxNodeLike = {
      type: 'method_declaration',
      childForFieldName: (name) => (name === 'type_parameters' ? params : null),
    }
    expect(extractTypeParameters(node)).toEqual(['T extends Comparable<T>'])
  })
})

describe('extractThrowsClause', () => {
  it('returns empty when no throws clause', () => {
    expect(extractThrowsClause(makeNode({ type: 'method_declaration' }))).toEqual([])
  })

  it('extracts exception type names', () => {
    const io: JavaSyntaxNodeLike = { type: 'type_identifier', text: 'IOException' }
    const sql: JavaSyntaxNodeLike = { type: 'type_identifier', text: 'SQLException' }
    const thr: JavaSyntaxNodeLike = { type: 'throws', namedChildren: [io, sql] }
    const node: JavaSyntaxNodeLike = {
      type: 'method_declaration',
      namedChildren: [thr],
    }
    expect(extractThrowsClause(node)).toEqual(['IOException', 'SQLException'])
  })
})

describe('enrichJavaSymbol', () => {
  it('returns all-empty enrichment for plain node', () => {
    const node = makeNode({ type: 'method_declaration' })
    const e = enrichJavaSymbol(node)
    expect(e.annotations).toEqual([])
    expect(e.modifiers).toEqual([])
    expect(e.typeParameters).toEqual([])
    expect(e.throwsClause).toEqual([])
  })
})

describe('hasJavaEnrichmentSignal', () => {
  it('returns false for empty enrichment', () => {
    expect(hasJavaEnrichmentSignal({ annotations: [], modifiers: [], typeParameters: [], throwsClause: [] })).toBe(
      false,
    )
  })

  it('returns true when modifiers present', () => {
    expect(
      hasJavaEnrichmentSignal({ annotations: [], modifiers: ['public'], typeParameters: [], throwsClause: [] }),
    ).toBe(true)
  })

  it('returns true when throwsClause present', () => {
    expect(
      hasJavaEnrichmentSignal({ annotations: [], modifiers: [], typeParameters: [], throwsClause: ['IOException'] }),
    ).toBe(true)
  })
})
