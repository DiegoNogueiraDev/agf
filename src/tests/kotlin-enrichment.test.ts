import { describe, it, expect } from 'vitest'
import {
  extractKotlinModifiers,
  isSuspendFunction,
  isExtensionFunction,
  extractKotlinAnnotations,
  extractKotlinTypeParameters,
  enrichKotlinSymbol,
  hasKotlinEnrichmentSignal,
  type KtSyntaxNodeLike,
} from '../core/code/treesitter/kotlin-enrichment.js'

function makeNode(overrides: Partial<KtSyntaxNodeLike> & { type: string }): KtSyntaxNodeLike {
  return { children: [], namedChildren: [], ...overrides }
}

describe('extractKotlinModifiers', () => {
  it('returns empty when no modifiers node', () => {
    expect(extractKotlinModifiers(makeNode({ type: 'function_declaration' }))).toEqual([])
  })

  it('extracts modifier by child type', () => {
    const pub: KtSyntaxNodeLike = { type: 'public' }
    const mods: KtSyntaxNodeLike = { type: 'modifiers', children: [pub], namedChildren: [] }
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      childForFieldName: (name) => (name === 'modifiers' ? mods : null),
    }
    expect(extractKotlinModifiers(node)).toContain('public')
  })

  it('falls back to text when type not in allowlist', () => {
    const mod: KtSyntaxNodeLike = { type: 'some_modifier_node', text: 'suspend' }
    const mods: KtSyntaxNodeLike = { type: 'modifiers', children: [mod], namedChildren: [] }
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      namedChildren: [mods],
    }
    expect(extractKotlinModifiers(node)).toContain('suspend')
  })

  it('skips unknown tokens', () => {
    const unknown: KtSyntaxNodeLike = { type: 'unknown_token', text: 'foobar' }
    const mods: KtSyntaxNodeLike = { type: 'modifiers', children: [unknown], namedChildren: [] }
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      namedChildren: [mods],
    }
    expect(extractKotlinModifiers(node)).toEqual([])
  })
})

describe('isSuspendFunction', () => {
  it('returns false for non-function nodes', () => {
    expect(isSuspendFunction(makeNode({ type: 'class_declaration' }))).toBe(false)
  })

  it('returns false when suspend not in modifiers', () => {
    const pub: KtSyntaxNodeLike = { type: 'public' }
    const mods: KtSyntaxNodeLike = { type: 'modifiers', children: [pub], namedChildren: [] }
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      namedChildren: [mods],
    }
    expect(isSuspendFunction(node)).toBe(false)
  })

  it('returns true when suspend modifier present', () => {
    const susp: KtSyntaxNodeLike = { type: 'suspend' }
    const mods: KtSyntaxNodeLike = { type: 'modifiers', children: [susp], namedChildren: [] }
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      childForFieldName: (name) => (name === 'modifiers' ? mods : null),
    }
    expect(isSuspendFunction(node)).toBe(true)
  })
})

describe('isExtensionFunction', () => {
  it('returns false for non-function nodes', () => {
    expect(isExtensionFunction(makeNode({ type: 'class_declaration' }))).toBe(false)
  })

  it('returns false when no receiver_type field', () => {
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      childForFieldName: () => null,
      namedChildren: [],
    }
    expect(isExtensionFunction(node)).toBe(false)
  })

  it('returns true when receiver_type field is present', () => {
    const receiver: KtSyntaxNodeLike = { type: 'receiver_type', text: 'String' }
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      childForFieldName: (name) => (name === 'receiver_type' ? receiver : null),
    }
    expect(isExtensionFunction(node)).toBe(true)
  })
})

describe('extractKotlinAnnotations', () => {
  it('returns empty when no modifiers', () => {
    expect(extractKotlinAnnotations(makeNode({ type: 'function_declaration' }))).toEqual([])
  })

  it('extracts annotation text', () => {
    const ann: KtSyntaxNodeLike = { type: 'annotation', text: '@JvmStatic' }
    const mods: KtSyntaxNodeLike = { type: 'modifiers', namedChildren: [ann], children: [] }
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      namedChildren: [mods],
    }
    expect(extractKotlinAnnotations(node)).toEqual(['@JvmStatic'])
  })
})

describe('extractKotlinTypeParameters', () => {
  it('returns empty when no type_parameters', () => {
    expect(extractKotlinTypeParameters(makeNode({ type: 'function_declaration' }))).toEqual([])
  })

  it('extracts type parameter text', () => {
    const t: KtSyntaxNodeLike = { type: 'type_parameter', text: 'T : Comparable<T>' }
    const params: KtSyntaxNodeLike = { type: 'type_parameters', namedChildren: [t] }
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      childForFieldName: (name) => (name === 'type_parameters' ? params : null),
    }
    expect(extractKotlinTypeParameters(node)).toEqual(['T : Comparable<T>'])
  })
})

describe('enrichKotlinSymbol', () => {
  it('returns all-empty enrichment for plain function node', () => {
    const node: KtSyntaxNodeLike = {
      type: 'function_declaration',
      childForFieldName: () => null,
      namedChildren: [],
    }
    const e = enrichKotlinSymbol(node)
    expect(e.modifiers).toEqual([])
    expect(e.isSuspend).toBe(false)
    expect(e.isExtensionFunction).toBe(false)
    expect(e.annotations).toEqual([])
    expect(e.typeParameters).toEqual([])
  })
})

describe('hasKotlinEnrichmentSignal', () => {
  it('returns false for empty enrichment', () => {
    expect(
      hasKotlinEnrichmentSignal({
        modifiers: [],
        isSuspend: false,
        isExtensionFunction: false,
        annotations: [],
        typeParameters: [],
      }),
    ).toBe(false)
  })

  it('returns true when isSuspend', () => {
    expect(
      hasKotlinEnrichmentSignal({
        modifiers: [],
        isSuspend: true,
        isExtensionFunction: false,
        annotations: [],
        typeParameters: [],
      }),
    ).toBe(true)
  })

  it('returns true when isExtensionFunction', () => {
    expect(
      hasKotlinEnrichmentSignal({
        modifiers: [],
        isSuspend: false,
        isExtensionFunction: true,
        annotations: [],
        typeParameters: [],
      }),
    ).toBe(true)
  })
})
