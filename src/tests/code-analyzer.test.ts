/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { calculateRiskLevel } from '../core/code/code-types.js'
import { TEST_OR_DECL_PATTERN } from '../core/code/code-indexer.js'
import { LANGUAGE_REFERENCES, SUPPORTED_LANGUAGES } from '../core/code/treesitter/reference-content.js'

import {
  isDunderName,
  findDecoratedWrapper,
  extractDecorators,
  isAsyncFunction,
  extractBaseClasses,
  enrichPythonSymbol,
} from '../core/code/treesitter/python-enrichment.js'
import type { PySyntaxNodeLike } from '../core/code/treesitter/python-enrichment.js'

import {
  extractReceiver,
  extractInterfaceMethods,
  extractTypeParams as extractGoTypeParams,
  enrichGoSymbol,
  hasGoEnrichmentSignal,
} from '../core/code/treesitter/go-enrichment.js'
import type { GoSyntaxNodeLike } from '../core/code/treesitter/go-enrichment.js'

import {
  isUnsafeNode,
  extractLifetimes,
  extractTraitImpl,
  parseDeriveAttribute,
  extractDerives,
  enrichRustSymbol,
  hasRustEnrichmentSignal,
} from '../core/code/treesitter/rust-enrichment.js'
import type { RsSyntaxNodeLike } from '../core/code/treesitter/rust-enrichment.js'

import {
  extractAnnotations,
  extractModifiers as extractJavaModifiers,
  extractTypeParameters as extractJavaTypeParameters,
  extractThrowsClause,
  enrichJavaSymbol,
  hasJavaEnrichmentSignal,
} from '../core/code/treesitter/java-enrichment.js'
import type { JavaSyntaxNodeLike } from '../core/code/treesitter/java-enrichment.js'

import {
  extractKotlinModifiers,
  isSuspendFunction,
  isExtensionFunction,
  extractKotlinAnnotations,
  extractKotlinTypeParameters,
  enrichKotlinSymbol,
  hasKotlinEnrichmentSignal,
} from '../core/code/treesitter/kotlin-enrichment.js'
import type { KtSyntaxNodeLike } from '../core/code/treesitter/kotlin-enrichment.js'

import {
  extractCsharpModifiers,
  extractCsharpAttributes,
  extractCsharpTypeParameters,
  extractCsharpWhereConstraints,
  extractCsharpBaseTypes,
  enrichCsharpSymbol,
  hasCsharpEnrichmentSignal,
} from '../core/code/treesitter/csharp-enrichment.js'
import type { CsSyntaxNodeLike } from '../core/code/treesitter/csharp-enrichment.js'

// ── Helper: stub factory ─────────────────────────────

function stubNode(
  type: string,
  overrides: Partial<{
    text: string
    parent: unknown
    namedChildren: unknown[]
    children: unknown[]
    previousNamedSibling: unknown
    previousSibling: unknown
    childForFieldName: (name: string) => unknown
    startPosition: { row: number }
    endPosition: { row: number }
  }> = {},
): any {
  return {
    type,
    text: '',
    parent: null,
    namedChildren: [],
    children: [],
    previousNamedSibling: null,
    previousSibling: null,
    childForFieldName: () => null,
    startPosition: { row: 0 },
    endPosition: { row: 0 },
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════
// code-types.ts
// ═══════════════════════════════════════════════════════

describe('calculateRiskLevel', () => {
  it('returns low for 0 affected symbols', () => {
    expect(calculateRiskLevel(0)).toBe('low')
  })

  it('returns low for 1-4 affected symbols', () => {
    expect(calculateRiskLevel(1)).toBe('low')
    expect(calculateRiskLevel(4)).toBe('low')
  })

  it('returns medium for 5-15 affected symbols', () => {
    expect(calculateRiskLevel(5)).toBe('medium')
    expect(calculateRiskLevel(10)).toBe('medium')
    expect(calculateRiskLevel(15)).toBe('medium')
  })

  it('returns high for 16+ affected symbols', () => {
    expect(calculateRiskLevel(16)).toBe('high')
    expect(calculateRiskLevel(100)).toBe('high')
  })

  it('handles negative numbers gracefully', () => {
    expect(calculateRiskLevel(-1)).toBe('low')
  })
})

// ═══════════════════════════════════════════════════════
// Python Enrichment
// ═══════════════════════════════════════════════════════

describe('Python enrichment', () => {
  describe('isDunderName', () => {
    it('detects standard dunder names', () => {
      expect(isDunderName('__init__')).toBe(true)
      expect(isDunderName('__call__')).toBe(true)
      expect(isDunderName('__str__')).toBe(true)
      expect(isDunderName('__repr__')).toBe(true)
    })

    it('rejects non-dunder names', () => {
      expect(isDunderName('foo')).toBe(false)
      expect(isDunderName('_private')).toBe(false)
      expect(isDunderName('__')).toBe(false)
      expect(isDunderName('____')).toBe(false)
      expect(isDunderName('')).toBe(false)
    })
  })

  describe('findDecoratedWrapper', () => {
    it('returns parent when it is decorated_definition', () => {
      const parent = stubNode('decorated_definition')
      const child = stubNode('function_definition', { parent })
      expect(findDecoratedWrapper(child)).toBe(parent)
    })

    it('returns null when parent is not decorated_definition', () => {
      const parent = stubNode('module')
      const child = stubNode('function_definition', { parent })
      expect(findDecoratedWrapper(child)).toBeNull()
    })

    it('returns null when there is no parent', () => {
      const child = stubNode('function_definition', { parent: null })
      expect(findDecoratedWrapper(child)).toBeNull()
    })
  })

  describe('extractDecorators', () => {
    it('returns decorator texts from decorated_definition', () => {
      const dec1 = stubNode('decorator', { text: '@property' })
      const dec2 = stubNode('decorator', { text: '@staticmethod' })
      const wrapper = stubNode('decorated_definition', { namedChildren: [dec1, dec2] })
      expect(extractDecorators(wrapper)).toEqual(['@property', '@staticmethod'])
    })

    it('returns empty for non-decorated nodes', () => {
      expect(extractDecorators(stubNode('function_definition'))).toEqual([])
    })

    it('returns empty for decorated_definition with no decorators', () => {
      const wrapper = stubNode('decorated_definition', { namedChildren: [] })
      expect(extractDecorators(wrapper)).toEqual([])
    })
  })

  describe('isAsyncFunction', () => {
    it('detects async keyword in children', () => {
      const asyncKw = stubNode('async')
      const node = stubNode('function_definition', { children: [asyncKw] })
      expect(isAsyncFunction(node)).toBe(true)
    })

    it('returns false for non-async functions', () => {
      const node = stubNode('function_definition', { children: [] })
      expect(isAsyncFunction(node)).toBe(false)
    })

    it('returns false for non-function nodes', () => {
      expect(isAsyncFunction(stubNode('class_definition'))).toBe(false)
    })
  })

  describe('extractBaseClasses', () => {
    it('extracts base classes from superclasses field', () => {
      const bar = stubNode('identifier', { text: 'Bar' })
      const baz = stubNode('identifier', { text: 'Baz' })
      const supers = stubNode('argument_list', { namedChildren: [bar, baz] })
      const node = stubNode('class_definition', {
        childForFieldName: (name: string) => (name === 'superclasses' ? supers : null),
      })
      expect(extractBaseClasses(node)).toEqual(['Bar', 'Baz'])
    })

    it('returns empty for non-class nodes', () => {
      expect(extractBaseClasses(stubNode('function_definition'))).toEqual([])
    })

    it('returns empty when there are no superclasses', () => {
      const node = stubNode('class_definition', { childForFieldName: () => null })
      expect(extractBaseClasses(node)).toEqual([])
    })
  })

  describe('enrichPythonSymbol', () => {
    it('enriches a plain function with no extras', () => {
      const node = stubNode('function_definition')
      const result = enrichPythonSymbol(node, 'my_func')
      expect(result.decorators).toEqual([])
      expect(result.isAsync).toBe(false)
      expect(result.isDunder).toBe(false)
      expect(result.baseClasses).toEqual([])
    })

    it('enriches a decorated async function', () => {
      const asyncKw = stubNode('async')
      const node = stubNode('function_definition', { children: [asyncKw] })
      const dec = stubNode('decorator', { text: '@background_task' })
      const wrapper = stubNode('decorated_definition', { namedChildren: [dec] })
      node.parent = wrapper

      const result = enrichPythonSymbol(node, 'run_job')
      expect(result.decorators).toEqual(['@background_task'])
      expect(result.isAsync).toBe(true)
      expect(result.isDunder).toBe(false)
    })

    it('detects dunder method', () => {
      const node = stubNode('function_definition')
      const result = enrichPythonSymbol(node, '__init__')
      expect(result.isDunder).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════
// Go Enrichment
// ═══════════════════════════════════════════════════════

describe('Go enrichment', () => {
  describe('extractReceiver', () => {
    it('returns pointer receiver for method', () => {
      const inner = stubNode('type_identifier', { text: 'MyStruct' })
      const pointer = stubNode('pointer_type', { namedChildren: [inner] })
      const decl = stubNode('parameter_declaration', {
        childForFieldName: (name: string) => (name === 'type' ? pointer : null),
      })
      const receiver = stubNode('parameter_list', { namedChildren: [decl] })
      const node = stubNode('method_declaration', {
        childForFieldName: (name: string) => (name === 'receiver' ? receiver : null),
      })
      expect(extractReceiver(node)).toEqual({ isPointer: true, typeName: 'MyStruct' })
    })

    it('returns value receiver', () => {
      const typeNode = stubNode('type_identifier', { text: 'MyStruct' })
      const decl = stubNode('parameter_declaration', {
        childForFieldName: (name: string) => (name === 'type' ? typeNode : null),
      })
      const receiver = stubNode('parameter_list', { namedChildren: [decl] })
      const node = stubNode('method_declaration', {
        childForFieldName: (name: string) => (name === 'receiver' ? receiver : null),
      })
      expect(extractReceiver(node)).toEqual({ isPointer: false, typeName: 'MyStruct' })
    })

    it('returns null for non-method nodes', () => {
      expect(extractReceiver(stubNode('function_declaration'))).toBeNull()
    })
  })

  describe('extractInterfaceMethods', () => {
    it('extracts methods from interface_type', () => {
      const m1 = stubNode('method_elem', { text: 'Read(p []byte) (n int)' })
      const m2 = stubNode('method_elem', { text: 'Write(p []byte) (n int)' })
      const iface = stubNode('interface_type', { namedChildren: [m1, m2] })
      expect(extractInterfaceMethods(iface)).toEqual(['Read(p []byte) (n int)', 'Write(p []byte) (n int)'])
    })

    it('extracts methods from type_spec wrapping interface', () => {
      const m = stubNode('method_spec', { text: 'ServeHTTP(w ResponseWriter)' })
      const iface = stubNode('interface_type', { namedChildren: [m] })
      const spec = stubNode('type_spec', {
        childForFieldName: (name: string) => (name === 'type' ? iface : null),
      })
      expect(extractInterfaceMethods(spec)).toEqual(['ServeHTTP(w ResponseWriter)'])
    })

    it('returns empty for non-interface nodes', () => {
      expect(extractInterfaceMethods(stubNode('function_declaration'))).toEqual([])
    })
  })

  describe('extractTypeParams (Go)', () => {
    it('extracts type parameters from field', () => {
      const t1 = stubNode('parameter_declaration', { text: 'T any' })
      const t2 = stubNode('parameter_declaration', { text: 'U comparable' })
      const tplist = stubNode('type_parameter_list', { namedChildren: [t1, t2] })
      const node = stubNode('function_declaration', {
        childForFieldName: (name: string) => (name === 'type_parameters' ? tplist : null),
      })
      expect(extractGoTypeParams(node)).toEqual(['T any', 'U comparable'])
    })

    it('returns empty when no type params', () => {
      expect(extractGoTypeParams(stubNode('function_declaration'))).toEqual([])
    })
  })

  describe('enrichGoSymbol / hasGoEnrichmentSignal', () => {
    it('returns empty enrichment for plain function', () => {
      const e = enrichGoSymbol(stubNode('function_declaration'))
      expect(e.receiver).toBeNull()
      expect(e.interfaceMethods).toEqual([])
      expect(e.typeParams).toEqual([])
      expect(hasGoEnrichmentSignal(e)).toBe(false)
    })

    it('detects enrichment signal from receiver', () => {
      const inner = stubNode('type_identifier', { text: 'T' })
      const pointer = stubNode('pointer_type', { namedChildren: [inner] })
      const decl = stubNode('parameter_declaration', {
        childForFieldName: (name: string) => (name === 'type' ? pointer : null),
      })
      const receiver = stubNode('parameter_list', { namedChildren: [decl] })
      const node = stubNode('method_declaration', {
        childForFieldName: (name: string) => (name === 'receiver' ? receiver : null),
      })
      const e = enrichGoSymbol(node)
      expect(e.receiver).toEqual({ isPointer: true, typeName: 'T' })
      expect(hasGoEnrichmentSignal(e)).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════
// Rust Enrichment
// ═══════════════════════════════════════════════════════

describe('Rust enrichment', () => {
  describe('isUnsafeNode', () => {
    it('detects unsafe fn', () => {
      const unsafeKw = stubNode('unsafe')
      const node = stubNode('function_item', { children: [unsafeKw] })
      expect(isUnsafeNode(node)).toBe(true)
    })

    it('returns false for safe fn', () => {
      const node = stubNode('function_item', { children: [] })
      expect(isUnsafeNode(node)).toBe(false)
    })

    it('returns false for non-function/impl nodes', () => {
      expect(isUnsafeNode(stubNode('struct_item'))).toBe(false)
    })
  })

  describe('extractLifetimes', () => {
    it('extracts lifetime params', () => {
      const l1 = stubNode('lifetime', { text: "'a" })
      const l2 = stubNode('lifetime', { text: "'b" })
      const params = stubNode('type_parameters', { namedChildren: [l1, l2] })
      const node = stubNode('function_item', {
        childForFieldName: (name: string) => (name === 'type_parameters' ? params : null),
      })
      expect(extractLifetimes(node)).toEqual(["'a", "'b"])
    })

    it('returns empty when no lifetimes', () => {
      const node = stubNode('function_item', { childForFieldName: () => null })
      expect(extractLifetimes(node)).toEqual([])
    })
  })

  describe('extractTraitImpl', () => {
    it('extracts trait and type from impl_item', () => {
      const traitNode = stubNode('type_identifier', { text: 'Display' })
      const typeNode = stubNode('type_identifier', { text: 'MyStruct' })
      const node = stubNode('impl_item', {
        childForFieldName: (name: string) => {
          if (name === 'trait') return traitNode
          if (name === 'type') return typeNode
          return null
        },
      })
      expect(extractTraitImpl(node)).toEqual({ trait: 'Display', forType: 'MyStruct' })
    })

    it('returns null for non-impl nodes', () => {
      expect(extractTraitImpl(stubNode('function_item'))).toBeNull()
    })

    it('returns null when missing trait or type', () => {
      const node = stubNode('impl_item', { childForFieldName: () => null })
      expect(extractTraitImpl(node)).toBeNull()
    })
  })

  describe('parseDeriveAttribute', () => {
    it('parses single derive', () => {
      expect(parseDeriveAttribute('#[derive(Debug)]')).toEqual(['Debug'])
    })

    it('parses multiple derives', () => {
      expect(parseDeriveAttribute('#[derive(Debug, Clone)]')).toEqual(['Debug', 'Clone'])
    })

    it('handles whitespace and trailing commas', () => {
      expect(parseDeriveAttribute('#[derive(  Eq , Hash , )]')).toEqual(['Eq', 'Hash'])
    })

    it('returns empty for empty derive', () => {
      expect(parseDeriveAttribute('#[derive()]')).toEqual([])
    })

    it('returns empty for non-derive attributes', () => {
      expect(parseDeriveAttribute('#[inline]')).toEqual([])
      expect(parseDeriveAttribute('')).toEqual([])
    })
  })

  describe('extractDerives', () => {
    it('collects derives from previous siblings', () => {
      const deriveAttr = stubNode('attribute_item', { text: '#[derive(Debug, Clone)]' })
      const node = stubNode('function_item', { previousNamedSibling: deriveAttr })
      expect(extractDerives(node)).toEqual(['Debug', 'Clone'])
    })

    it('preserves source order of multiple derive attributes', () => {
      const attr1 = stubNode('attribute_item', { text: '#[derive(Serialize)]' })
      const attr2 = stubNode('attribute_item', { text: '#[derive(Deserialize)]', previousNamedSibling: attr1 })
      const node = stubNode('function_item', { previousNamedSibling: attr2 })
      expect(extractDerives(node)).toEqual(['Serialize', 'Deserialize'])
    })

    it('stops at first non-attribute sibling', () => {
      const docAttr = stubNode('attribute_item', { text: '#[doc = "foo"]' })
      const node = stubNode('function_item', { previousNamedSibling: docAttr })
      expect(extractDerives(node)).toEqual([])
    })

    it('returns empty when no derives found', () => {
      expect(extractDerives(stubNode('function_item'))).toEqual([])
    })
  })

  describe('enrichRustSymbol / hasRustEnrichmentSignal', () => {
    it('returns empty for plain fn', () => {
      const e = enrichRustSymbol(stubNode('function_item'))
      expect(e.isUnsafe).toBe(false)
      expect(e.lifetimes).toEqual([])
      expect(e.traitImpl).toBeNull()
      expect(e.derives).toEqual([])
      expect(hasRustEnrichmentSignal(e)).toBe(false)
    })

    it('detects unsafe', () => {
      const unsafeKw = stubNode('unsafe')
      const e = enrichRustSymbol(stubNode('function_item', { children: [unsafeKw] }))
      expect(e.isUnsafe).toBe(true)
      expect(hasRustEnrichmentSignal(e)).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════
// Java Enrichment
// ═══════════════════════════════════════════════════════

describe('Java enrichment', () => {
  describe('extractAnnotations', () => {
    it('extracts marker annotations from modifiers block', () => {
      const ann = stubNode('marker_annotation', { text: '@Override' })
      const mods = stubNode('modifiers', { namedChildren: [ann] })
      const node = stubNode('method_declaration', {
        childForFieldName: (name: string) => (name === 'modifiers' ? mods : null),
      })
      expect(extractAnnotations(node)).toEqual(['@Override'])
    })
  })

  describe('extractModifiers (Java)', () => {
    it('extracts Java modifier keywords by node type', () => {
      const pub = stubNode('public')
      const stat = stubNode('static')
      const fin = stubNode('final')
      const mods = stubNode('modifiers', { children: [pub, stat, fin] })
      const node = stubNode('method_declaration', {
        childForFieldName: (name: string) => (name === 'modifiers' ? mods : null),
      })
      expect(extractJavaModifiers(node)).toEqual(['public', 'static', 'final'])
    })
  })

  describe('extractTypeParameters (Java)', () => {
    it('extracts generic type parameters', () => {
      const t1 = stubNode('type_parameter', { text: 'T' })
      const t2 = stubNode('type_parameter', { text: 'U extends Comparable<T>' })
      const params = stubNode('type_parameters', { namedChildren: [t1, t2] })
      const node = stubNode('class_declaration', {
        childForFieldName: (name: string) => (name === 'type_parameters' ? params : null),
      })
      expect(extractJavaTypeParameters(node)).toEqual(['T', 'U extends Comparable<T>'])
    })
  })

  describe('extractThrowsClause', () => {
    it('extracts exception types', () => {
      const ex1 = stubNode('type_identifier', { text: 'IOException' })
      const ex2 = stubNode('type_identifier', { text: 'SQLException' })
      const thr = stubNode('throws', { namedChildren: [ex1, ex2] })
      const node = stubNode('method_declaration', { namedChildren: [thr] })
      expect(extractThrowsClause(node)).toEqual(['IOException', 'SQLException'])
    })

    it('returns empty when no throws clause', () => {
      expect(extractThrowsClause(stubNode('method_declaration'))).toEqual([])
    })
  })

  describe('enrichJavaSymbol / hasJavaEnrichmentSignal', () => {
    it('returns empty for plain method', () => {
      const e = enrichJavaSymbol(stubNode('method_declaration'))
      expect(e.annotations).toEqual([])
      expect(e.modifiers).toEqual([])
      expect(e.typeParameters).toEqual([])
      expect(e.throwsClause).toEqual([])
      expect(hasJavaEnrichmentSignal(e)).toBe(false)
    })

    it('detects annotations', () => {
      const ann = stubNode('marker_annotation', { text: '@Override' })
      const mods = stubNode('modifiers', { namedChildren: [ann] })
      const node = stubNode('method_declaration', {
        childForFieldName: (name: string) => (name === 'modifiers' ? mods : null),
      })
      const e = enrichJavaSymbol(node)
      expect(e.annotations).toEqual(['@Override'])
      expect(hasJavaEnrichmentSignal(e)).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════
// Kotlin Enrichment
// ═══════════════════════════════════════════════════════

describe('Kotlin enrichment', () => {
  describe('extractKotlinModifiers', () => {
    it('extracts modifiers by node type', () => {
      const pub = stubNode('public')
      const op = stubNode('open')
      const mods = stubNode('modifiers', { children: [pub, op] })
      const node = stubNode('function_declaration', {
        childForFieldName: (name: string) => (name === 'modifiers' ? mods : null),
      })
      expect(extractKotlinModifiers(node)).toEqual(['public', 'open'])
    })

    it('falls back to text when node type is not in allowlist', () => {
      const customMod = stubNode('custom_modifier', { text: 'suspend' })
      const mods = stubNode('modifiers', { children: [customMod] })
      const node = stubNode('function_declaration', {
        childForFieldName: (name: string) => (name === 'modifiers' ? mods : null),
      })
      expect(extractKotlinModifiers(node)).toEqual(['suspend'])
    })

    it('returns empty when no modifiers', () => {
      expect(extractKotlinModifiers(stubNode('function_declaration'))).toEqual([])
    })
  })

  describe('isSuspendFunction', () => {
    it('detects suspend modifier', () => {
      const susp = stubNode('suspend')
      const mods = stubNode('modifiers', { children: [susp] })
      const node = stubNode('function_declaration', {
        childForFieldName: (name: string) => (name === 'modifiers' ? mods : null),
      })
      expect(isSuspendFunction(node)).toBe(true)
    })

    it('returns false for non-suspend function', () => {
      expect(isSuspendFunction(stubNode('function_declaration'))).toBe(false)
    })

    it('returns false for non-function nodes', () => {
      expect(isSuspendFunction(stubNode('class_declaration'))).toBe(false)
    })
  })

  describe('isExtensionFunction', () => {
    it('detects extension function with receiver_type field', () => {
      const receiver = stubNode('receiver_type', { text: 'String' })
      const node = stubNode('function_declaration', {
        childForFieldName: (name: string) => (name === 'receiver_type' ? receiver : null),
      })
      expect(isExtensionFunction(node)).toBe(true)
    })

    it('detects extension function with named child fallback', () => {
      const receiver = stubNode('receiver_type', { text: 'String' })
      const node = stubNode('function_declaration', { namedChildren: [receiver] })
      expect(isExtensionFunction(node)).toBe(true)
    })

    it('returns false for regular function', () => {
      expect(isExtensionFunction(stubNode('function_declaration'))).toBe(false)
    })
  })

  describe('extractKotlinAnnotations', () => {
    it('extracts annotations from modifiers block', () => {
      const ann = stubNode('annotation', { text: '@JvmStatic' })
      const mods = stubNode('modifiers', { namedChildren: [ann] })
      const node = stubNode('function_declaration', {
        childForFieldName: (name: string) => (name === 'modifiers' ? mods : null),
      })
      expect(extractKotlinAnnotations(node)).toEqual(['@JvmStatic'])
    })
  })

  describe('extractKotlinTypeParameters', () => {
    it('extracts type parameters', () => {
      const tp = stubNode('type_parameter', { text: 'T : Comparable<T>' })
      const params = stubNode('type_parameters', { namedChildren: [tp] })
      const node = stubNode('function_declaration', {
        childForFieldName: (name: string) => (name === 'type_parameters' ? params : null),
      })
      expect(extractKotlinTypeParameters(node)).toEqual(['T : Comparable<T>'])
    })
  })

  describe('enrichKotlinSymbol / hasKotlinEnrichmentSignal', () => {
    it('returns empty for plain function', () => {
      const e = enrichKotlinSymbol(stubNode('function_declaration'))
      expect(e.modifiers).toEqual([])
      expect(e.isSuspend).toBe(false)
      expect(e.isExtensionFunction).toBe(false)
      expect(e.annotations).toEqual([])
      expect(e.typeParameters).toEqual([])
      expect(hasKotlinEnrichmentSignal(e)).toBe(false)
    })

    it('detects suspend extension function', () => {
      const susp = stubNode('suspend')
      const mods = stubNode('modifiers', { children: [susp] })
      const receiver = stubNode('receiver_type', { text: 'String' })
      const node = stubNode('function_declaration', {
        childForFieldName: (name: string) => {
          if (name === 'modifiers') return mods
          if (name === 'receiver_type') return receiver
          return null
        },
        namedChildren: [receiver],
      })
      const e = enrichKotlinSymbol(node)
      expect(e.modifiers).toContain('suspend')
      expect(e.isSuspend).toBe(true)
      expect(e.isExtensionFunction).toBe(true)
      expect(hasKotlinEnrichmentSignal(e)).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════
// C# Enrichment
// ═══════════════════════════════════════════════════════

describe('C# enrichment', () => {
  describe('extractCsharpModifiers', () => {
    it('extracts modifier keywords by child node type', () => {
      const pub = stubNode('public')
      const stat = stubNode('static')
      const asyncKw = stubNode('async')
      const node = stubNode('method_declaration', { children: [pub, stat, asyncKw] })
      expect(extractCsharpModifiers(node)).toEqual(['public', 'static', 'async'])
    })

    it('returns empty for nodes with no modifiers', () => {
      expect(extractCsharpModifiers(stubNode('method_declaration'))).toEqual([])
    })
  })

  describe('extractCsharpAttributes', () => {
    it('extracts attribute list text when bracketed', () => {
      const attrList = stubNode('attribute_list', { text: '[Serializable]' })
      const node = stubNode('class_declaration', { namedChildren: [attrList] })
      expect(extractCsharpAttributes(node)).toEqual(['[Serializable]'])
    })

    it('synthesizes bracket form from inner attributes', () => {
      const attr = stubNode('attribute', { text: 'Obsolete("use X")' })
      const attrList = stubNode('attribute_list', { namedChildren: [attr], text: 'Obsolete("use X")' })
      const node = stubNode('method_declaration', { namedChildren: [attrList] })
      expect(extractCsharpAttributes(node)).toEqual(['[Obsolete("use X")]'])
    })
  })

  describe('extractCsharpTypeParameters', () => {
    it('extracts type parameters from field', () => {
      const tp = stubNode('type_parameter', { text: 'T' })
      const tpList = stubNode('type_parameter_list', { namedChildren: [tp] })
      const node = stubNode('class_declaration', {
        childForFieldName: (name: string) => (name === 'type_parameters' ? tpList : null),
      })
      expect(extractCsharpTypeParameters(node)).toEqual(['T'])
    })
  })

  describe('extractCsharpWhereConstraints', () => {
    it('extracts where constraint clauses', () => {
      const clause = stubNode('type_parameter_constraints_clause', { text: 'where T : IDisposable' })
      const node = stubNode('class_declaration', { namedChildren: [clause] })
      expect(extractCsharpWhereConstraints(node)).toEqual(['where T : IDisposable'])
    })
  })

  describe('extractCsharpBaseTypes', () => {
    it('extracts base types from base_list', () => {
      const bar = stubNode('type_identifier', { text: 'Bar' })
      const iface = stubNode('type_identifier', { text: 'IDisposable' })
      const baseList = stubNode('base_list', { namedChildren: [bar, iface] })
      const node = stubNode('class_declaration', {
        childForFieldName: (name: string) => (name === 'bases' ? baseList : null),
      })
      expect(extractCsharpBaseTypes(node)).toEqual(['Bar', 'IDisposable'])
    })
  })

  describe('enrichCsharpSymbol / hasCsharpEnrichmentSignal', () => {
    it('returns empty for plain method', () => {
      const e = enrichCsharpSymbol(stubNode('method_declaration'))
      expect(e.modifiers).toEqual([])
      expect(e.attributes).toEqual([])
      expect(e.typeParameters).toEqual([])
      expect(e.whereConstraints).toEqual([])
      expect(e.isAsync).toBe(false)
      expect(e.baseTypes).toEqual([])
      expect(hasCsharpEnrichmentSignal(e)).toBe(false)
    })

    it('detects async method', () => {
      const asyncKw = stubNode('async')
      const node = stubNode('method_declaration', { children: [asyncKw] })
      const e = enrichCsharpSymbol(node)
      expect(e.isAsync).toBe(true)
      expect(hasCsharpEnrichmentSignal(e)).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════
// Reference Content — LANGUAGE_REFERENCES data integrity
// ═══════════════════════════════════════════════════════

describe('LANGUAGE_REFERENCES data integrity', () => {
  it('contains all supported languages', () => {
    const expected = ['python', 'go', 'rust', 'java', 'c', 'cpp', 'ruby', 'php', 'kotlin', 'swift', 'csharp', 'lua']
    for (const lang of expected) {
      expect(LANGUAGE_REFERENCES[lang]).toBeDefined()
    }
  })

  it('SUPPORTED_LANGUAGES matches keys', () => {
    expect(SUPPORTED_LANGUAGES.sort()).toEqual(Object.keys(LANGUAGE_REFERENCES).sort())
  })

  it('every language has required fields', () => {
    for (const [id, ref] of Object.entries(LANGUAGE_REFERENCES)) {
      expect(ref.languageId).toBe(id)
      expect(ref.extensions.length).toBeGreaterThan(0)
      expect(ref.symbolNodeTypes).toBeDefined()
      expect(Object.keys(ref.symbolNodeTypes).length).toBeGreaterThan(0)
      expect(ref.importNodeTypes).toBeDefined()
      expect(ref.visibilityRules).toBeDefined()
      expect(ref.visibilityRules.defaultVisibility).toBeDefined()
      expect(ref.visibilityRules.exportDetection).toBeDefined()
      expect(ref.docstringPattern).toBeDefined()
      expect(ref.docstringPattern.commentRegex).toBeInstanceOf(RegExp)
    }
  })

  it('python has correct visiblity rules', () => {
    const py = LANGUAGE_REFERENCES.python
    expect(py.visibilityRules.exportDetection).toBe('underscore_prefix')
    expect(py.visibilityRules.defaultVisibility).toBe('public')
  })

  it('rust has correct visibility rules', () => {
    const rs = LANGUAGE_REFERENCES.rust
    expect(rs.visibilityRules.exportDetection).toBe('pub_keyword')
    expect(rs.visibilityRules.defaultVisibility).toBe('private')
  })

  it('go has correct visibility rules', () => {
    const go = LANGUAGE_REFERENCES.go
    expect(go.visibilityRules.exportDetection).toBe('uppercase_first')
    expect(go.visibilityRules.defaultVisibility).toBe('package')
  })
})

// ═══════════════════════════════════════════════════════
// TEST_OR_DECL_PATTERN — Regex matching
// ═══════════════════════════════════════════════════════

describe('TEST_OR_DECL_PATTERN', () => {
  it('matches .test.ts files', () => {
    expect(TEST_OR_DECL_PATTERN.test('foo.test.ts')).toBe(true)
    expect(TEST_OR_DECL_PATTERN.test('foo.spec.ts')).toBe(true)
  })

  it('matches .d.ts declaration files', () => {
    expect(TEST_OR_DECL_PATTERN.test('types.d.ts')).toBe(true)
    expect(TEST_OR_DECL_PATTERN.test('index.d.mts')).toBe(true)
  })

  it('matches Go _test.go files', () => {
    expect(TEST_OR_DECL_PATTERN.test('foo_test.go')).toBe(true)
  })

  it('matches Python test files', () => {
    expect(TEST_OR_DECL_PATTERN.test('test_foo.py')).toBe(true)
    expect(TEST_OR_DECL_PATTERN.test('foo_test.py')).toBe(true)
    expect(TEST_OR_DECL_PATTERN.test('conftest.py')).toBe(true)
  })

  it('matches Java/Kotlin test files', () => {
    expect(TEST_OR_DECL_PATTERN.test('FooTest.java')).toBe(true)
    expect(TEST_OR_DECL_PATTERN.test('FooTests.java')).toBe(true)
    expect(TEST_OR_DECL_PATTERN.test('FooIT.java')).toBe(true)
    expect(TEST_OR_DECL_PATTERN.test('FooTest.kt')).toBe(true)
  })

  it('matches C# test files', () => {
    expect(TEST_OR_DECL_PATTERN.test('FooTests.cs')).toBe(true)
    expect(TEST_OR_DECL_PATTERN.test('FooTest.cs')).toBe(true)
  })

  it('rejects regular source files', () => {
    expect(TEST_OR_DECL_PATTERN.test('foo.ts')).toBe(false)
    expect(TEST_OR_DECL_PATTERN.test('foo.go')).toBe(false)
    expect(TEST_OR_DECL_PATTERN.test('foo.py')).toBe(false)
    expect(TEST_OR_DECL_PATTERN.test('foo.java')).toBe(false)
    expect(TEST_OR_DECL_PATTERN.test('foo.kt')).toBe(false)
  })
})
