import { describe, it, expect } from 'vitest'
import {
  isUnsafeNode,
  extractLifetimes,
  extractTraitImpl,
  parseDeriveAttribute,
  extractDerives,
  enrichRustSymbol,
  hasRustEnrichmentSignal,
  type RsSyntaxNodeLike,
} from '../core/code/treesitter/rust-enrichment.js'

function makeNode(overrides: Partial<RsSyntaxNodeLike> & { type: string }): RsSyntaxNodeLike {
  return {
    children: [],
    namedChildren: [],
    parent: null,
    previousSibling: null,
    previousNamedSibling: null,
    ...overrides,
  }
}

describe('isUnsafeNode', () => {
  it('returns false for non-function/impl nodes', () => {
    expect(isUnsafeNode(makeNode({ type: 'struct_item' }))).toBe(false)
  })

  it('returns false for function_item without unsafe child', () => {
    const node = makeNode({ type: 'function_item', children: [makeNode({ type: 'fn' })] })
    expect(isUnsafeNode(node)).toBe(false)
  })

  it('returns true for function_item with unsafe child', () => {
    const node = makeNode({
      type: 'function_item',
      children: [makeNode({ type: 'unsafe' }), makeNode({ type: 'fn' })],
    })
    expect(isUnsafeNode(node)).toBe(true)
  })

  it('returns true for impl_item with unsafe child', () => {
    const node = makeNode({
      type: 'impl_item',
      children: [makeNode({ type: 'unsafe' })],
    })
    expect(isUnsafeNode(node)).toBe(true)
  })
})

describe('extractLifetimes', () => {
  it('returns empty array when no type_parameters field', () => {
    const node = makeNode({ type: 'function_item' })
    expect(extractLifetimes(node)).toEqual([])
  })

  it('extracts lifetime nodes from type_parameters', () => {
    const lifeNode: RsSyntaxNodeLike = { type: 'lifetime', text: "'a", namedChildren: [] }
    const params: RsSyntaxNodeLike = { type: 'type_parameters', namedChildren: [lifeNode] }
    const node: RsSyntaxNodeLike = {
      type: 'function_item',
      childForFieldName: (name) => (name === 'type_parameters' ? params : null),
    }
    expect(extractLifetimes(node)).toEqual(["'a"])
  })

  it('ignores non-lifetime children', () => {
    const typeNode: RsSyntaxNodeLike = { type: 'type_identifier', text: 'T', namedChildren: [] }
    const params: RsSyntaxNodeLike = { type: 'type_parameters', namedChildren: [typeNode] }
    const node: RsSyntaxNodeLike = {
      type: 'function_item',
      childForFieldName: (name) => (name === 'type_parameters' ? params : null),
    }
    expect(extractLifetimes(node)).toEqual([])
  })
})

describe('extractTraitImpl', () => {
  it('returns null for non-impl nodes', () => {
    expect(extractTraitImpl(makeNode({ type: 'function_item' }))).toBeNull()
  })

  it('returns null for impl_item without trait field', () => {
    const node: RsSyntaxNodeLike = {
      type: 'impl_item',
      childForFieldName: () => null,
    }
    expect(extractTraitImpl(node)).toBeNull()
  })

  it('returns trait and forType for trait impl', () => {
    const traitNode: RsSyntaxNodeLike = { type: 'type_identifier', text: 'Display' }
    const typeNode: RsSyntaxNodeLike = { type: 'type_identifier', text: 'MyStruct' }
    const node: RsSyntaxNodeLike = {
      type: 'impl_item',
      childForFieldName: (name) => (name === 'trait' ? traitNode : name === 'type' ? typeNode : null),
    }
    expect(extractTraitImpl(node)).toEqual({ trait: 'Display', forType: 'MyStruct' })
  })
})

describe('parseDeriveAttribute', () => {
  it('returns empty array for non-derive text', () => {
    expect(parseDeriveAttribute('#[inline]')).toEqual([])
  })

  it('parses single derive', () => {
    expect(parseDeriveAttribute('#[derive(Debug)]')).toEqual(['Debug'])
  })

  it('parses multiple derives', () => {
    expect(parseDeriveAttribute('#[derive(Debug, Clone, PartialEq)]')).toEqual(['Debug', 'Clone', 'PartialEq'])
  })

  it('handles extra whitespace and trailing comma', () => {
    expect(parseDeriveAttribute('#[derive(  Eq , Hash , )]')).toEqual(['Eq', 'Hash'])
  })

  it('returns empty array for empty derive', () => {
    expect(parseDeriveAttribute('#[derive()]')).toEqual([])
  })
})

describe('extractDerives', () => {
  it('returns empty for node with no sibling', () => {
    const node = makeNode({ type: 'struct_item' })
    expect(extractDerives(node)).toEqual([])
  })

  it('collects derives from attribute siblings', () => {
    const attrSibling: RsSyntaxNodeLike = {
      type: 'attribute_item',
      text: '#[derive(Debug, Clone)]',
      previousNamedSibling: null,
      previousSibling: null,
    }
    const node: RsSyntaxNodeLike = {
      type: 'struct_item',
      previousNamedSibling: attrSibling,
    }
    expect(extractDerives(node)).toEqual(['Debug', 'Clone'])
  })

  it('stops at non-attribute sibling', () => {
    const nonAttr: RsSyntaxNodeLike = { type: 'comment', text: '// comment' }
    const attrSibling: RsSyntaxNodeLike = {
      type: 'attribute_item',
      text: '#[derive(Eq)]',
      previousNamedSibling: nonAttr,
    }
    const node: RsSyntaxNodeLike = {
      type: 'struct_item',
      previousNamedSibling: attrSibling,
    }
    expect(extractDerives(node)).toEqual(['Eq'])
  })
})

describe('enrichRustSymbol', () => {
  it('returns all-empty enrichment for plain struct_item', () => {
    const node = makeNode({ type: 'struct_item' })
    const e = enrichRustSymbol(node)
    expect(e.isUnsafe).toBe(false)
    expect(e.lifetimes).toEqual([])
    expect(e.traitImpl).toBeNull()
    expect(e.derives).toEqual([])
  })
})

describe('hasRustEnrichmentSignal', () => {
  it('returns false for empty enrichment', () => {
    expect(hasRustEnrichmentSignal({ isUnsafe: false, lifetimes: [], traitImpl: null, derives: [] })).toBe(false)
  })

  it('returns true when isUnsafe', () => {
    expect(hasRustEnrichmentSignal({ isUnsafe: true, lifetimes: [], traitImpl: null, derives: [] })).toBe(true)
  })

  it('returns true when lifetimes present', () => {
    expect(hasRustEnrichmentSignal({ isUnsafe: false, lifetimes: ["'a"], traitImpl: null, derives: [] })).toBe(true)
  })

  it('returns true when derives present', () => {
    expect(hasRustEnrichmentSignal({ isUnsafe: false, lifetimes: [], traitImpl: null, derives: ['Debug'] })).toBe(true)
  })
})
