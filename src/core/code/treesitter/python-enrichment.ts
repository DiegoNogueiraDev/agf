/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Python-specific symbol enrichment for the tree-sitter analyzer.
 *
 * The generic `extractSymbolsFromNode` walks the AST and produces
 * `{name, kind, file, exported, ...}` for every symbol. That's the
 * cross-language baseline. This module adds **Python-specific** signal
 * that the generic walker doesn't capture:
 *
 *   - decorators            (e.g. `@property`, `@staticmethod`, `@my_decorator(arg)`)
 *   - async functions       (`async def foo()`)
 *   - dunder methods        (`__init__`, `__call__`, etc.)
 *   - base classes          (`class Foo(Bar, Baz):` → ["Bar", "Baz"])
 *
 * Output is shaped to live under `CodeSymbol.metadata.python = {...}` so
 * downstream consumers (RAG filters, dashboard, code-intel queries) can
 * read it without changing the cross-language Symbol schema.
 *
 * The functions take a tree-sitter `SyntaxNode` and the source `content`
 * string. They are pure (no DB, no fs), so they're trivially unit-testable
 * via the existing tree-sitter integration test pattern.
 */

/**
 * The minimum SyntaxNode shape this module reads from. Declared as an
 * interface here (rather than imported from `web-tree-sitter`) so test
 * fixtures can stub it without dragging in the WASM runtime.
 */
export interface PySyntaxNodeLike {
  readonly type: string
  readonly text?: string
  readonly parent?: PySyntaxNodeLike | null
  readonly namedChildren?: ReadonlyArray<PySyntaxNodeLike> | null
  readonly children?: ReadonlyArray<PySyntaxNodeLike> | null
  childForFieldName?: (name: string) => PySyntaxNodeLike | null
}

/** Python-specific enrichment payload that augments `CodeSymbol.metadata`. */
export interface PythonEnrichment {
  decorators: string[]
  isAsync: boolean
  isDunder: boolean
  baseClasses: string[]
}

const DECORATED_DEFINITION_TYPE = 'decorated_definition'
const DECORATOR_TYPE = 'decorator'
const FUNCTION_DEFINITION_TYPE = 'function_definition'
const CLASS_DEFINITION_TYPE = 'class_definition'
const ARGUMENT_LIST_TYPE = 'argument_list'
const SUPERCLASSES_TYPE = 'superclasses'

/** Return true when the symbol name matches Python's dunder convention. */
export function isDunderName(name: string): boolean {
  // Two leading and two trailing underscores, with at least one identifier
  // character in between (so plain "__" is not classified as dunder).
  return /^__[A-Za-z][A-Za-z0-9_]*__$/.test(name)
}

/**
 * Walk up the parent chain looking for a `decorated_definition` wrapper.
 * Tree-sitter's Python grammar wraps `def`/`class` in a parent node when
 * decorators precede them; the def/class node itself doesn't know it was
 * decorated. We climb at most one level — decorators bind to a single
 * definition, never to nested ones.
 */
export function findDecoratedWrapper(node: PySyntaxNodeLike): PySyntaxNodeLike | null {
  const pVar = node.parent
  if (pVar && pVar.type === DECORATED_DEFINITION_TYPE) return pVar
  return null
}

/**
 * Extract decorator source-text strings (with the leading `@`) from a
 * `decorated_definition` wrapper. Returns `[]` when the node isn't a
 * wrapper or has no decorators.
 *
 * Each entry is the verbatim source slice up to the end of the decorator
 * call (e.g. `"@property"`, `"@my_decorator(arg)"`). We don't try to
 * parse arguments out — the raw text is what RAG/UI consumers want.
 */
export function extractDecorators(wrapper: PySyntaxNodeLike): string[] {
  if (!wrapper || wrapper.type !== DECORATED_DEFINITION_TYPE) return []
  const out: string[] = []
  for (const child of wrapper.namedChildren ?? []) {
    if (child.type === DECORATOR_TYPE) {
      const text = (child.text ?? '').trim()
      if (text) out.push(text)
    }
  }
  return out
}

/**
 * Detect `async def` by scanning the immediate children of a function
 * definition for the `async` keyword token. Tree-sitter Python emits
 * the keyword as an unnamed child of `function_definition` when
 * `async def` is used.
 */
export function isAsyncFunction(node: PySyntaxNodeLike): boolean {
  if (node.type !== FUNCTION_DEFINITION_TYPE) return false
  for (const child of node.children ?? []) {
    if (child.type === 'async') return true
  }
  return false
}

/**
 * Extract base class identifiers from a `class_definition`. Tree-sitter
 * Python exposes them via the `superclasses` field (an `argument_list`).
 * We collect the verbatim text of each child as the base class spec —
 * both bare names (`Bar`) and generic forms (`Generic[T]`) come back
 * unmodified, which is what consumers need for cross-reference.
 */
export function extractBaseClasses(node: PySyntaxNodeLike): string[] {
  if (node.type !== CLASS_DEFINITION_TYPE) return []
  const supers =
    node.childForFieldName?.('superclasses') ??
    node.namedChildren?.find((c) => c.type === SUPERCLASSES_TYPE || c.type === ARGUMENT_LIST_TYPE)
  if (!supers) return []
  const out: string[] = []
  for (const child of supers.namedChildren ?? []) {
    const text = (child.text ?? '').trim()
    if (text && text !== '(' && text !== ')' && text !== ',') out.push(text)
  }
  return out
}

/**
 * Compose the four enrichment fields into a single payload. `name` is
 * passed in (the analyzer already resolved it) so this function doesn't
 * need to re-walk to find it.
 */
export function enrichPythonSymbol(node: PySyntaxNodeLike, symbolName: string): PythonEnrichment {
  const wrapper = findDecoratedWrapper(node)
  const decorators = wrapper ? extractDecorators(wrapper) : []
  const isAsync = isAsyncFunction(node)
  const isDunder = isDunderName(symbolName)
  const baseClasses = extractBaseClasses(node)
  return { decorators, isAsync, isDunder, baseClasses }
}
