/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Rust-specific symbol enrichment for the tree-sitter analyzer.
 *
 * Mirrors `python-enrichment.ts` and `go-enrichment.ts`. Adds Rust signal
 * the generic walker drops:
 *
 *   - isUnsafe        — `unsafe fn` or `unsafe impl`
 *   - lifetimes       — generic lifetime params, e.g. ["'a", "'b"]
 *   - traitImpl       — for `impl Trait for Type`, captures both names;
 *                       `null` for inherent `impl Type` blocks and non-impl nodes.
 *   - derives         — `#[derive(Debug, Clone)]` → ["Debug", "Clone"]
 *
 * Output lives under `CodeSymbol.metadata.rust`. Same structurally-typed
 * stub interface (RsSyntaxNodeLike) so unit tests don't need WASM.
 */

/**
 * Subset of tree-sitter SyntaxNode this module reads from. Declared
 * structurally so test fixtures don't pull in the WASM runtime.
 */
export interface RsSyntaxNodeLike {
  readonly type: string
  readonly text?: string
  readonly parent?: RsSyntaxNodeLike | null
  readonly previousSibling?: RsSyntaxNodeLike | null
  readonly previousNamedSibling?: RsSyntaxNodeLike | null
  readonly namedChildren?: ReadonlyArray<RsSyntaxNodeLike> | null
  readonly children?: ReadonlyArray<RsSyntaxNodeLike> | null
  childForFieldName?: (name: string) => RsSyntaxNodeLike | null
}

/** Per-symbol Rust enrichment payload. */
export interface RustEnrichment {
  isUnsafe: boolean
  lifetimes: string[]
  traitImpl: { trait: string; forType: string } | null
  derives: string[]
}

const FUNCTION_ITEM_TYPE = 'function_item'
const IMPL_ITEM_TYPE = 'impl_item'
const TYPE_PARAMETERS_TYPE = 'type_parameters'
const LIFETIME_TYPE = 'lifetime'
const ATTRIBUTE_ITEM_TYPE = 'attribute_item'

/**
 * Detect `unsafe` keyword as a child token. Tree-sitter Rust emits the
 * keyword as an unnamed child of `function_item`/`impl_item`. Returns
 * false for any node where a leading `unsafe` is not applicable.
 */
export function isUnsafeNode(node: RsSyntaxNodeLike): boolean {
  if (node.type !== FUNCTION_ITEM_TYPE && node.type !== IMPL_ITEM_TYPE) {
    return false
  }
  for (const child of node.children ?? []) {
    if (child.type === 'unsafe') return true
  }
  return false
}

/**
 * Extract lifetime parameters (verbatim text, including the leading `'`)
 * from the `type_parameters` field. Tree-sitter Rust represents them as
 * `lifetime` nodes inside the parameter list.
 */
export function extractLifetimes(node: RsSyntaxNodeLike): string[] {
  const params =
    node.childForFieldName?.('type_parameters') ?? node.namedChildren?.find((c) => c.type === TYPE_PARAMETERS_TYPE)
  if (!params) return []
  const out: string[] = []
  for (const child of params.namedChildren ?? []) {
    if (child.type === LIFETIME_TYPE) {
      const text = (child.text ?? '').trim()
      if (text) out.push(text)
    }
  }
  return out
}

/**
 * For an `impl_item`, return `{trait, forType}` when the impl declares a
 * trait implementation, or `null` for inherent `impl Type` blocks. Reads
 * the `trait` and `type` fields exposed by tree-sitter-rust.
 */
export function extractTraitImpl(node: RsSyntaxNodeLike): { trait: string; forType: string } | null {
  if (node.type !== IMPL_ITEM_TYPE) return null
  const traitNode = node.childForFieldName?.('trait')
  const typeNode = node.childForFieldName?.('type')
  if (!traitNode || !typeNode) return null
  const trait = (traitNode.text ?? '').trim()
  const forType = (typeNode.text ?? '').trim()
  if (!trait || !forType) return null
  return { trait, forType }
}

/**
 * Parse the inside of a `derive(...)` attribute and return each macro
 * name. Robust against extra whitespace and trailing commas.
 *
 * Examples:
 *   "#[derive(Debug, Clone)]"  → ["Debug", "Clone"]
 *   "#[derive(  Eq , Hash , )]" → ["Eq", "Hash"]
 *   "#[derive()]"               → []
 *   non-derive attribute        → []
 */
export function parseDeriveAttribute(text: string): string[] {
  const mVar = /^\s*#\[\s*derive\s*\(([^)]*)\)\s*\]\s*$/.exec(text)
  if (!mVar) return []
  const inner = mVar[1]
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Walk the previous sibling chain looking for `attribute_item` nodes
 * with `derive(...)` content. Stops at the first non-attribute sibling
 * (which means we've passed the leading attribute block).
 *
 * Tree-sitter-rust represents attributes as siblings preceding the
 * `function_item`/`struct_item`/etc., so we climb backwards collecting
 * derive macros until we hit something that isn't an attribute.
 */
export function extractDerives(node: RsSyntaxNodeLike): string[] {
  const out: string[] = []
  let cursor: RsSyntaxNodeLike | null | undefined = node.previousNamedSibling ?? node.previousSibling ?? null
  while (cursor) {
    if (cursor.type !== ATTRIBUTE_ITEM_TYPE) break
    const text = cursor.text ?? ''
    const derives = parseDeriveAttribute(text)
    // Prepend so source order is preserved.
    if (derives.length > 0) out.unshift(...derives)
    cursor = cursor.previousNamedSibling ?? cursor.previousSibling ?? null
  }
  return out
}

/** Compose the four enrichment fields into a single payload. */
export function enrichRustSymbol(node: RsSyntaxNodeLike): RustEnrichment {
  return {
    isUnsafe: isUnsafeNode(node),
    lifetimes: extractLifetimes(node),
    traitImpl: extractTraitImpl(node),
    derives: extractDerives(node),
  }
}

/** True when at least one enrichment field carries useful signal. */
export function hasRustEnrichmentSignal(e: RustEnrichment): boolean {
  return e.isUnsafe || e.lifetimes.length > 0 || e.traitImpl !== null || e.derives.length > 0
}
