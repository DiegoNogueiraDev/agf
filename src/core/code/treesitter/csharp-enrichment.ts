/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * C#-specific symbol enrichment for the tree-sitter analyzer.
 *
 * Mirrors python/go/rust/java/kotlin-enrichment. Adds C# signal the
 * generic walker drops:
 *
 *   - modifiers       — `public`, `private`, `protected`, `internal`,
 *                       `static`, `readonly`, `virtual`, `override`,
 *                       `abstract`, `sealed`, `async`, `partial`,
 *                       `unsafe`, `extern`, `volatile`, `const`,
 *                       `new`, `ref`, `in`, `out`, `required`, `file`
 *   - attributes      — verbatim incl. brackets, e.g.
 *                       `["[Serializable]", "[Obsolete(\"use X\")]"]`
 *   - typeParameters  — generic bounds verbatim, e.g. `["T", "U"]`
 *                       (constraint clauses live in their own field —
 *                        `whereConstraints` below — to preserve the
 *                        `where T : IDisposable` source form)
 *   - whereConstraints — verbatim source of any
 *                        `type_parameter_constraints_clause`, e.g.
 *                        `["where T : IDisposable, new()"]`
 *   - isAsync         — `async` modifier on a method
 *   - baseTypes       — for `class Foo : Bar, IDisposable` →
 *                       `["Bar", "IDisposable"]`
 *
 * Output lives under `CodeSymbol.metadata.csharp`. Same structurally-typed
 * stub interface so unit tests skip WASM.
 */

/** Subset of tree-sitter SyntaxNode this module reads. */
export interface CsSyntaxNodeLike {
  readonly type: string
  readonly text?: string
  readonly namedChildren?: ReadonlyArray<CsSyntaxNodeLike> | null
  readonly children?: ReadonlyArray<CsSyntaxNodeLike> | null
  childForFieldName?: (name: string) => CsSyntaxNodeLike | null
}

/** Per-symbol C# enrichment payload. */
export interface CsharpEnrichment {
  modifiers: string[]
  attributes: string[]
  typeParameters: string[]
  whereConstraints: string[]
  isAsync: boolean
  baseTypes: string[]
}

const ATTRIBUTE_LIST_TYPE = 'attribute_list'
const ATTRIBUTE_TYPE = 'attribute'
const TYPE_PARAMETER_LIST_TYPE = 'type_parameter_list'
const TYPE_PARAMETER_TYPE = 'type_parameter'
const TYPE_PARAMETER_CONSTRAINTS_CLAUSE_TYPE = 'type_parameter_constraints_clause'
const BASE_LIST_TYPE = 'base_list'
const METHOD_DECLARATION_TYPE = 'method_declaration'

/**
 * Allowlist of C# modifiers. Sourced from C# Language Spec §10.3.5
 * (member modifiers) + later additions (async §15.15, partial §10.3,
 * unsafe §23.2, required §11.7.2, file-scoped types §10.7).
 */
const CSHARP_MODIFIER_TOKENS = new Set([
  // Visibility
  'public',
  'private',
  'protected',
  'internal',
  // Storage / lifetime
  'static',
  'readonly',
  'const',
  'volatile',
  // Inheritance
  'virtual',
  'override',
  'abstract',
  'sealed',
  'new',
  // Concurrency / safety
  'async',
  'unsafe',
  'extern',
  // Class-level
  'partial',
  'file',
  // Parameter / property
  'ref',
  'in',
  'out',
  'required',
])

/**
 * Extract modifier keywords. Tree-sitter-c-sharp wraps each modifier in a
 * generic `modifier` node whose keyword lives in `.text` (not `.type`) —
 * confirmed against the real grammar output, not just this module's own
 * stub tests. A bare keyword-typed child is also accepted for robustness
 * against grammar versions that emit the keyword as the node type directly.
 * Order is preserved as written.
 */
export function extractCsharpModifiers(node: CsSyntaxNodeLike): string[] {
  const out: string[] = []
  for (const child of node.children ?? []) {
    if (child.type === 'modifier' && child.text && CSHARP_MODIFIER_TOKENS.has(child.text.trim())) {
      out.push(child.text.trim())
    } else if (CSHARP_MODIFIER_TOKENS.has(child.type)) {
      out.push(child.type)
    }
  }
  return out
}

/**
 * Extract attribute source text (with brackets) from `attribute_list`
 * children. Tree-sitter-c-sharp groups attributes inside an
 * `attribute_list` node — multiple lists may precede one declaration.
 *
 * We capture the FULL list bracket form (`[Foo, Bar("x")]`) by reading
 * the list node's text. If the grammar exposes only the inner
 * `attribute` nodes, we wrap each in brackets so output is consistent.
 */
export function extractCsharpAttributes(node: CsSyntaxNodeLike): string[] {
  const out: string[] = []
  for (const child of node.namedChildren ?? []) {
    if (child.type !== ATTRIBUTE_LIST_TYPE) continue
    const listText = (child.text ?? '').trim()
    if (listText.startsWith('[') && listText.endsWith(']')) {
      out.push(listText)
      continue
    }
    // Fallback: walk the inner attribute children and synthesize.
    const innerNames: string[] = []
    for (const attr of child.namedChildren ?? []) {
      if (attr.type === ATTRIBUTE_TYPE) {
        const tVar = (attr.text ?? '').trim()
        if (tVar) innerNames.push(tVar)
      }
    }
    if (innerNames.length > 0) {
      out.push(`[${innerNames.join(', ')}]`)
    }
  }
  return out
}

/** Extract generic type parameters (verbatim) from `type_parameter_list`. */
export function extractCsharpTypeParameters(node: CsSyntaxNodeLike): string[] {
  const params =
    node.childForFieldName?.('type_parameters') ?? node.namedChildren?.find((c) => c.type === TYPE_PARAMETER_LIST_TYPE)
  if (!params) return []
  const out: string[] = []
  for (const child of params.namedChildren ?? []) {
    if (child.type === TYPE_PARAMETER_TYPE) {
      const text = (child.text ?? '').trim()
      if (text) out.push(text)
    }
  }
  return out
}

/**
 * Extract `where T : Constraint` clauses verbatim. Tree-sitter-c-sharp
 * emits each as a `type_parameter_constraints_clause` named child of
 * the declaration.
 */
export function extractCsharpWhereConstraints(node: CsSyntaxNodeLike): string[] {
  const out: string[] = []
  for (const child of node.namedChildren ?? []) {
    if (child.type === TYPE_PARAMETER_CONSTRAINTS_CLAUSE_TYPE) {
      const text = (child.text ?? '').trim()
      if (text) out.push(text)
    }
  }
  return out
}

/** Extract base class + interfaces from `base_list` (`class Foo : Bar, IDisposable`). */
export function extractCsharpBaseTypes(node: CsSyntaxNodeLike): string[] {
  const baseList = node.childForFieldName?.('bases') ?? node.namedChildren?.find((c) => c.type === BASE_LIST_TYPE)
  if (!baseList) return []
  const out: string[] = []
  for (const child of baseList.namedChildren ?? []) {
    const text = (child.text ?? '').trim()
    if (text) out.push(text)
  }
  return out
}

/** Compose all enrichment fields. */
export function enrichCsharpSymbol(node: CsSyntaxNodeLike): CsharpEnrichment {
  const modifiers = extractCsharpModifiers(node)
  return {
    modifiers,
    attributes: extractCsharpAttributes(node),
    typeParameters: extractCsharpTypeParameters(node),
    whereConstraints: extractCsharpWhereConstraints(node),
    isAsync: node.type === METHOD_DECLARATION_TYPE && modifiers.includes('async'),
    baseTypes: extractCsharpBaseTypes(node),
  }
}

/** True when at least one enrichment field carries useful signal. */
export function hasCsharpEnrichmentSignal(e: CsharpEnrichment): boolean {
  return (
    e.modifiers.length > 0 ||
    e.attributes.length > 0 ||
    e.typeParameters.length > 0 ||
    e.whereConstraints.length > 0 ||
    e.isAsync ||
    e.baseTypes.length > 0
  )
}
