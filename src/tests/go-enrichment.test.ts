import { describe, it, expect } from 'vitest'
import {
  extractReceiver,
  extractInterfaceMethods,
  extractTypeParams,
  enrichGoSymbol,
  hasGoEnrichmentSignal,
  type GoSyntaxNodeLike,
} from '../core/code/treesitter/go-enrichment.js'

function makeNode(overrides: Partial<GoSyntaxNodeLike> & { type: string }): GoSyntaxNodeLike {
  return {
    children: [],
    namedChildren: [],
    ...overrides,
  }
}

describe('extractReceiver', () => {
  it('returns null for non-method nodes', () => {
    expect(extractReceiver(makeNode({ type: 'function_declaration' }))).toBeNull()
  })

  it('returns null when method_declaration has no receiver', () => {
    const node = makeNode({ type: 'method_declaration', namedChildren: [] })
    expect(extractReceiver(node)).toBeNull()
  })

  it('returns value receiver info', () => {
    const typeIdent: GoSyntaxNodeLike = { type: 'type_identifier', text: 'MyStruct' }
    const decl: GoSyntaxNodeLike = {
      type: 'parameter_declaration',
      childForFieldName: (name) => (name === 'type' ? typeIdent : null),
      namedChildren: [typeIdent],
    }
    const receiverList: GoSyntaxNodeLike = {
      type: 'parameter_list',
      namedChildren: [decl],
    }
    const node: GoSyntaxNodeLike = {
      type: 'method_declaration',
      childForFieldName: (name) => (name === 'receiver' ? receiverList : null),
    }
    expect(extractReceiver(node)).toEqual({ isPointer: false, typeName: 'MyStruct' })
  })

  it('returns pointer receiver info', () => {
    const typeIdent: GoSyntaxNodeLike = { type: 'type_identifier', text: 'MyStruct' }
    const ptrType: GoSyntaxNodeLike = {
      type: 'pointer_type',
      namedChildren: [typeIdent],
    }
    const decl: GoSyntaxNodeLike = {
      type: 'parameter_declaration',
      childForFieldName: (name) => (name === 'type' ? ptrType : null),
      namedChildren: [ptrType],
    }
    const receiverList: GoSyntaxNodeLike = {
      type: 'parameter_list',
      namedChildren: [decl],
    }
    const node: GoSyntaxNodeLike = {
      type: 'method_declaration',
      childForFieldName: (name) => (name === 'receiver' ? receiverList : null),
    }
    expect(extractReceiver(node)).toEqual({ isPointer: true, typeName: 'MyStruct' })
  })
})

describe('extractInterfaceMethods', () => {
  it('returns empty array for non-interface nodes', () => {
    expect(extractInterfaceMethods(makeNode({ type: 'function_declaration' }))).toEqual([])
  })

  it('extracts method signatures from interface_type', () => {
    const method: GoSyntaxNodeLike = { type: 'method_elem', text: 'Read(p []byte) (int, error)' }
    const iface: GoSyntaxNodeLike = { type: 'interface_type', namedChildren: [method] }
    expect(extractInterfaceMethods(iface)).toEqual(['Read(p []byte) (int, error)'])
  })

  it('extracts from type_spec wrapping interface_type', () => {
    const method: GoSyntaxNodeLike = { type: 'method_spec', text: 'Close() error' }
    const iface: GoSyntaxNodeLike = { type: 'interface_type', namedChildren: [method] }
    const typeSpec: GoSyntaxNodeLike = {
      type: 'type_spec',
      childForFieldName: (name) => (name === 'type' ? iface : null),
    }
    expect(extractInterfaceMethods(typeSpec)).toEqual(['Close() error'])
  })

  it('returns empty for interface with no methods', () => {
    const iface = makeNode({ type: 'interface_type' })
    expect(extractInterfaceMethods(iface)).toEqual([])
  })
})

describe('extractTypeParams', () => {
  it('returns empty when no type_parameters field', () => {
    expect(extractTypeParams(makeNode({ type: 'function_declaration' }))).toEqual([])
  })

  it('extracts type parameter text', () => {
    const param: GoSyntaxNodeLike = { type: 'parameter_declaration', text: 'T any' }
    const tpList: GoSyntaxNodeLike = { type: 'type_parameter_list', namedChildren: [param] }
    const node: GoSyntaxNodeLike = {
      type: 'function_declaration',
      childForFieldName: (name) => (name === 'type_parameters' ? tpList : null),
    }
    expect(extractTypeParams(node)).toEqual(['T any'])
  })
})

describe('enrichGoSymbol', () => {
  it('returns all-empty enrichment for plain function node', () => {
    const node = makeNode({ type: 'function_declaration' })
    const e = enrichGoSymbol(node)
    expect(e.receiver).toBeNull()
    expect(e.interfaceMethods).toEqual([])
    expect(e.typeParams).toEqual([])
  })
})

describe('hasGoEnrichmentSignal', () => {
  it('returns false for empty enrichment', () => {
    expect(hasGoEnrichmentSignal({ receiver: null, interfaceMethods: [], typeParams: [] })).toBe(false)
  })

  it('returns true when receiver is present', () => {
    expect(
      hasGoEnrichmentSignal({ receiver: { isPointer: false, typeName: 'T' }, interfaceMethods: [], typeParams: [] }),
    ).toBe(true)
  })

  it('returns true when interfaceMethods is non-empty', () => {
    expect(hasGoEnrichmentSignal({ receiver: null, interfaceMethods: ['Read()'], typeParams: [] })).toBe(true)
  })

  it('returns true when typeParams is non-empty', () => {
    expect(hasGoEnrichmentSignal({ receiver: null, interfaceMethods: [], typeParams: ['T any'] })).toBe(true)
  })
})
