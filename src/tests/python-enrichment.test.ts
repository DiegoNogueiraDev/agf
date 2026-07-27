import { describe, it, expect } from 'vitest'
import {
  isDunderName,
  findDecoratedWrapper,
  extractDecorators,
  isAsyncFunction,
  extractBaseClasses,
  enrichPythonSymbol,
  type PySyntaxNodeLike,
} from '../core/code/treesitter/python-enrichment.js'

function makeNode(overrides: Partial<PySyntaxNodeLike> & { type: string }): PySyntaxNodeLike {
  return {
    children: [],
    namedChildren: [],
    parent: null,
    ...overrides,
  }
}

describe('isDunderName', () => {
  it('matches __init__', () => {
    expect(isDunderName('__init__')).toBe(true)
  })

  it('matches __call__', () => {
    expect(isDunderName('__call__')).toBe(true)
  })

  it('rejects plain __ (no inner identifier)', () => {
    expect(isDunderName('__')).toBe(false)
  })

  it('rejects regular names', () => {
    expect(isDunderName('my_func')).toBe(false)
  })

  it('rejects names with single underscores', () => {
    expect(isDunderName('_private')).toBe(false)
  })
})

describe('findDecoratedWrapper', () => {
  it('returns null when no parent', () => {
    const node = makeNode({ type: 'function_definition', parent: null })
    expect(findDecoratedWrapper(node)).toBeNull()
  })

  it('returns null when parent is not decorated_definition', () => {
    const parent = makeNode({ type: 'block' })
    const node = makeNode({ type: 'function_definition', parent })
    expect(findDecoratedWrapper(node)).toBeNull()
  })

  it('returns parent when it is decorated_definition', () => {
    const wrapper = makeNode({ type: 'decorated_definition' })
    const node = makeNode({ type: 'function_definition', parent: wrapper })
    expect(findDecoratedWrapper(node)).toBe(wrapper)
  })
})

describe('extractDecorators', () => {
  it('returns empty for non-decorated_definition node', () => {
    expect(extractDecorators(makeNode({ type: 'function_definition' }))).toEqual([])
  })

  it('returns empty for node with no decorator children', () => {
    const wrapper = makeNode({ type: 'decorated_definition', namedChildren: [] })
    expect(extractDecorators(wrapper)).toEqual([])
  })

  it('extracts single decorator', () => {
    const dec: PySyntaxNodeLike = { type: 'decorator', text: '@property' }
    const wrapper = makeNode({ type: 'decorated_definition', namedChildren: [dec] })
    expect(extractDecorators(wrapper)).toEqual(['@property'])
  })

  it('extracts multiple decorators', () => {
    const dec1: PySyntaxNodeLike = { type: 'decorator', text: '@staticmethod' }
    const dec2: PySyntaxNodeLike = { type: 'decorator', text: '@my_decorator(arg)' }
    const wrapper = makeNode({ type: 'decorated_definition', namedChildren: [dec1, dec2] })
    expect(extractDecorators(wrapper)).toEqual(['@staticmethod', '@my_decorator(arg)'])
  })
})

describe('isAsyncFunction', () => {
  it('returns false for non-function nodes', () => {
    expect(isAsyncFunction(makeNode({ type: 'class_definition' }))).toBe(false)
  })

  it('returns false for sync function (no async child)', () => {
    const node = makeNode({
      type: 'function_definition',
      children: [makeNode({ type: 'def' })],
    })
    expect(isAsyncFunction(node)).toBe(false)
  })

  it('returns true for async function', () => {
    const node = makeNode({
      type: 'function_definition',
      children: [makeNode({ type: 'async' }), makeNode({ type: 'def' })],
    })
    expect(isAsyncFunction(node)).toBe(true)
  })
})

describe('extractBaseClasses', () => {
  it('returns empty for non-class nodes', () => {
    expect(extractBaseClasses(makeNode({ type: 'function_definition' }))).toEqual([])
  })

  it('returns empty for class with no superclasses', () => {
    const node = makeNode({ type: 'class_definition', namedChildren: [] })
    expect(extractBaseClasses(node)).toEqual([])
  })

  it('extracts base class names', () => {
    const bar: PySyntaxNodeLike = { type: 'identifier', text: 'Bar' }
    const baz: PySyntaxNodeLike = { type: 'identifier', text: 'Baz' }
    const supers: PySyntaxNodeLike = { type: 'argument_list', namedChildren: [bar, baz] }
    const node: PySyntaxNodeLike = {
      type: 'class_definition',
      childForFieldName: (name) => (name === 'superclasses' ? supers : null),
      namedChildren: [supers],
    }
    expect(extractBaseClasses(node)).toEqual(['Bar', 'Baz'])
  })
})

describe('enrichPythonSymbol', () => {
  it('returns all-empty enrichment for plain sync function without decorators', () => {
    const node = makeNode({ type: 'function_definition', parent: null })
    const e = enrichPythonSymbol(node, 'my_func')
    expect(e.decorators).toEqual([])
    expect(e.isAsync).toBe(false)
    expect(e.isDunder).toBe(false)
    expect(e.baseClasses).toEqual([])
  })

  it('marks isDunder for __init__', () => {
    const node = makeNode({ type: 'function_definition', parent: null })
    const e = enrichPythonSymbol(node, '__init__')
    expect(e.isDunder).toBe(true)
  })

  it('marks isAsync for async function node', () => {
    const node = makeNode({
      type: 'function_definition',
      parent: null,
      children: [makeNode({ type: 'async' })],
    })
    const e = enrichPythonSymbol(node, 'fetch_data')
    expect(e.isAsync).toBe(true)
  })
})
