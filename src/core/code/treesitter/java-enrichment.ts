/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Java-specific symbol enrichment for the tree-sitter analyzer.
 *
 * Mirrors the pattern of python/go/rust-enrichment. Adds Java signal the
 * generic walker drops:
 *
 *   - annotations    — verbatim text incl. `@`, e.g.
 *                      ["@Override", "@SuppressWarnings(\"unchecked\")"]
 *   - modifiers      — `public`, `static`, `final`, `abstract`, etc.
 *   - typeParameters — generic bounds verbatim, e.g.
 *                      ["T", "U extends Comparable<T>"]
 *   - throwsClause   — exception types, e.g. ["IOException", "SQLException"]
 *
 * Output lives under `CodeSymbol.metadata.java`. Same structurally-typed
 * stub interface so unit tests skip WASM.
 */

/**
 * Subset of tree-sitter SyntaxNode this module reads from. Declared
 * structurally so test fixtures don't pull in the WASM runtime.
 */
export interface JavaSyntaxNodeLike {
  readonly type: string
  readonly text?: string
  readonly namedChildren?: ReadonlyArray<JavaSyntaxNodeLike> | null
  readonly children?: ReadonlyArray<JavaSyntaxNodeLike> | null
  childForFieldName?: (name: string) => JavaSyntaxNodeLike | null
}

/** Per-symbol Java enrichment payload. */
export interface JavaEnrichment {
  annotations: string[]
  modifiers: string[]
  typeParameters: string[]
  throwsClause: string[]
}

const MODIFIERS_TYPE = 'modifiers'
const ANNOTATION_TYPES = new Set(['annotation', 'marker_annotation', 'single_element_annotation'])
const TYPE_PARAMETERS_TYPE = 'type_parameters'
const TYPE_PARAMETER_TYPE = 'type_parameter'
const THROWS_TYPE = 'throws'

/**
 * Java's modifier set. Tree-sitter-java emits each as a token child of
 * `modifiers`. Annotations are also children of the same `modifiers` node
 * but live under separate node types (handled by `extractAnnotations`).
 *
 * Source-of-truth list: JLS §8.1.1, §8.4.3, §9.4 — kept here as a defensive
 * allowlist so extraneous tokens (whitespace, comments) never leak through.
 */
const JAVA_MODIFIER_TOKENS = new Set([
  'public',
  'protected',
  'private',
  'static',
  'final',
  'abstract',
  'synchronized',
  'native',
  'transient',
  'volatile',
  'default',
  'strictfp',
  'sealed',
  'non-sealed',
])

/**
 * Find the `modifiers` field child if present. Falls back to a named-child
 * search when the field accessor is missing (older grammars / partial
 * stubs in tests).
 */
function findModifiersNode(node: JavaSyntaxNodeLike): JavaSyntaxNodeLike | null {
  return node.childForFieldName?.('modifiers') ?? node.namedChildren?.find((c) => c.type === MODIFIERS_TYPE) ?? null
}

/**
 * Extract annotation source text (with the `@` prefix) from the
 * `modifiers` block. Tree-sitter-java emits annotations as named
 * children of the `modifiers` node — `marker_annotation` for `@Foo`,
 * `single_element_annotation` for `@Foo("x")`, and `annotation` for
 * the multi-element form `@Foo(a = 1, b = "x")`.
 */
export function extractAnnotations(node: JavaSyntaxNodeLike): string[] {
  const mods = findModifiersNode(node)
  if (!mods) return []
  const out: string[] = []
  for (const child of mods.namedChildren ?? []) {
    if (ANNOTATION_TYPES.has(child.type)) {
      const text = (child.text ?? '').trim()
      if (text) out.push(text)
    }
  }
  return out
}

/**
 * Extract Java modifier keywords (`public`, `static`, `final`, ...) from
 * the `modifiers` block. Order is preserved as written in source. Unknown
 * tokens are skipped — `JAVA_MODIFIER_TOKENS` is the allowlist.
 */
export function extractModifiers(node: JavaSyntaxNodeLike): string[] {
  const mods = findModifiersNode(node)
  if (!mods) return []
  const out: string[] = []
  for (const child of mods.children ?? []) {
    if (JAVA_MODIFIER_TOKENS.has(child.type)) {
      out.push(child.type)
    }
  }
  return out
}

/**
 * Extract generic type parameters verbatim. Tree-sitter-java exposes them
 * via a `type_parameters` field; each entry is a `type_parameter` node
 * whose source text covers the name and any `extends` bound.
 *
 * Examples:
 *   `<T>`                        → ["T"]
 *   `<T, U>`                     → ["T", "U"]
 *   `<T extends Comparable<T>>`  → ["T extends Comparable<T>"]
 */
export function extractTypeParameters(node: JavaSyntaxNodeLike): string[] {
  const params =
    node.childForFieldName?.('type_parameters') ?? node.namedChildren?.find((c) => c.type === TYPE_PARAMETERS_TYPE)
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
 * Extract the `throws` clause exception types from a method declaration.
 * Tree-sitter-java exposes a `throws` child whose named children are
 * type identifiers (or generic types like `MyException<T>`).
 */
export function extractThrowsClause(node: JavaSyntaxNodeLike): string[] {
  const thr = node.namedChildren?.find((c) => c.type === THROWS_TYPE)
  if (!thr) return []
  const out: string[] = []
  for (const child of thr.namedChildren ?? []) {
    const text = (child.text ?? '').trim()
    if (text) out.push(text)
  }
  return out
}

/** Compose the four enrichment fields into a single payload. */
export function enrichJavaSymbol(node: JavaSyntaxNodeLike): JavaEnrichment {
  return {
    annotations: extractAnnotations(node),
    modifiers: extractModifiers(node),
    typeParameters: extractTypeParameters(node),
    throwsClause: extractThrowsClause(node),
  }
}

/** True when at least one enrichment field carries useful signal. */
export function hasJavaEnrichmentSignal(e: JavaEnrichment): boolean {
  return e.annotations.length > 0 || e.modifiers.length > 0 || e.typeParameters.length > 0 || e.throwsClause.length > 0
}
