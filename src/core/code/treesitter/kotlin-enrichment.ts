/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Kotlin-specific symbol enrichment for the tree-sitter analyzer.
 *
 * Mirrors python/go/rust/java-enrichment. Adds Kotlin signal the generic
 * walker drops:
 *
 *   - modifiers          — `data`, `sealed`, `enum`, `inline`, `inner`,
 *                          `abstract`, `open`, `override`, `final`,
 *                          `private`, `protected`, `public`, `internal`,
 *                          `companion`, `lateinit`, `const`, `external`,
 *                          `tailrec`, `operator`, `infix`, `expect`, `actual`,
 *                          `crossinline`, `noinline`, `vararg`
 *   - isSuspend          — `suspend fun foo()` (coroutines)
 *   - isExtensionFunction — `fun Foo.bar()` declared on a receiver type
 *   - annotations        — verbatim, e.g. `@JvmStatic`, `@Deprecated("x")`
 *   - typeParameters     — generic bounds verbatim, e.g. `["T : Comparable<T>"]`
 *
 * Output lives under `CodeSymbol.metadata.kotlin`. Same structurally-typed
 * stub interface so unit tests skip WASM.
 */

/** Subset of tree-sitter SyntaxNode this module reads. */
export interface KtSyntaxNodeLike {
  readonly type: string
  readonly text?: string
  readonly namedChildren?: ReadonlyArray<KtSyntaxNodeLike> | null
  readonly children?: ReadonlyArray<KtSyntaxNodeLike> | null
  childForFieldName?: (name: string) => KtSyntaxNodeLike | null
}

/** Per-symbol Kotlin enrichment payload. */
export interface KotlinEnrichment {
  modifiers: string[]
  isSuspend: boolean
  isExtensionFunction: boolean
  annotations: string[]
  typeParameters: string[]
}

const MODIFIERS_TYPE = 'modifiers'
const FUNCTION_DECLARATION_TYPE = 'function_declaration'
const TYPE_PARAMETERS_TYPE = 'type_parameters'
const TYPE_PARAMETER_TYPE = 'type_parameter'
const ANNOTATION_TYPES = new Set(['annotation', 'marker_annotation'])
const RECEIVER_TYPE_FIELD = 'receiver_type'

/**
 * Kotlin's modifier set. Tree-sitter-kotlin emits these as child node
 * types of `modifiers`; we use an allowlist so unknown grammar tokens
 * never leak through. Source-of-truth: Kotlin language spec §11.4.
 */
const KOTLIN_MODIFIER_TOKENS = new Set([
  // Visibility
  'public',
  'protected',
  'private',
  'internal',
  // Class kinds / class modifiers
  'data',
  'sealed',
  'enum',
  'annotation',
  'inner',
  'value',
  // Inheritance
  'abstract',
  'open',
  'override',
  'final',
  // Function modifiers
  'suspend',
  'inline',
  'tailrec',
  'operator',
  'infix',
  'external',
  // Parameter modifiers
  'crossinline',
  'noinline',
  'vararg',
  // Property modifiers
  'lateinit',
  'const',
  // Multiplatform
  'expect',
  'actual',
  // Object modifier
  'companion',
])

function findModifiersNode(node: KtSyntaxNodeLike): KtSyntaxNodeLike | null {
  return node.childForFieldName?.('modifiers') ?? node.namedChildren?.find((c) => c.type === MODIFIERS_TYPE) ?? null
}

/**
 * Extract modifier keywords. Tree-sitter-kotlin exposes each modifier as
 * a typed child of the `modifiers` node (e.g. `class_modifier` whose
 * text is `data`). Some grammars emit the keyword as the child's `type`,
 * others as its `text`. We try `type` first (matches the JAVA pattern),
 * then fall back to `text` if the type isn't in the allowlist.
 */
export function extractKotlinModifiers(node: KtSyntaxNodeLike): string[] {
  const mods = findModifiersNode(node)
  if (!mods) return []
  const out: string[] = []
  for (const child of mods.children ?? []) {
    if (KOTLIN_MODIFIER_TOKENS.has(child.type)) {
      out.push(child.type)
      continue
    }
    const text = (child.text ?? '').trim()
    if (KOTLIN_MODIFIER_TOKENS.has(text)) {
      out.push(text)
    }
  }
  return out
}

/** True when the `suspend` modifier is present on a function. */
export function isSuspendFunction(node: KtSyntaxNodeLike): boolean {
  if (node.type !== FUNCTION_DECLARATION_TYPE) return false
  return extractKotlinModifiers(node).includes('suspend')
}

/**
 * True when the function is declared on a receiver type, i.e. an
 * extension function `fun Foo.bar()`. Tree-sitter-kotlin exposes the
 * receiver via the `receiver_type` field.
 */
export function isExtensionFunction(node: KtSyntaxNodeLike): boolean {
  if (node.type !== FUNCTION_DECLARATION_TYPE) return false
  const receiver =
    node.childForFieldName?.(RECEIVER_TYPE_FIELD) ??
    node.namedChildren?.find((c) => c.type === RECEIVER_TYPE_FIELD || c.type === 'receiver_type')
  return receiver !== null && receiver !== undefined
}

/** Extract annotations from the modifiers block (verbatim with `@`). */
export function extractKotlinAnnotations(node: KtSyntaxNodeLike): string[] {
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

/** Extract generic type parameters verbatim from `type_parameters`. */
export function extractKotlinTypeParameters(node: KtSyntaxNodeLike): string[] {
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

/** Compose all enrichment fields. */
export function enrichKotlinSymbol(node: KtSyntaxNodeLike): KotlinEnrichment {
  const modifiers = extractKotlinModifiers(node)
  return {
    modifiers,
    isSuspend: node.type === FUNCTION_DECLARATION_TYPE && modifiers.includes('suspend'),
    isExtensionFunction: isExtensionFunction(node),
    annotations: extractKotlinAnnotations(node),
    typeParameters: extractKotlinTypeParameters(node),
  }
}

/** True when at least one enrichment field carries useful signal. */
export function hasKotlinEnrichmentSignal(e: KotlinEnrichment): boolean {
  return (
    e.modifiers.length > 0 ||
    e.isSuspend ||
    e.isExtensionFunction ||
    e.annotations.length > 0 ||
    e.typeParameters.length > 0
  )
}
