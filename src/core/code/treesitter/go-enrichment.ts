/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Go-specific symbol enrichment for the tree-sitter analyzer.
 *
 * Mirrors `python-enrichment.ts`. The generic walker emits the
 * cross-language baseline; this module adds Go-specific signal:
 *
 *   - method receiver info  (pointer vs value, receiver type name)
 *   - interface method set  (method signatures listed inside an interface)
 *   - generic parameters    (`[T any, U comparable]`)
 *
 * Output lives under `CodeSymbol.metadata.go = {...}`. Same
 * structurally-typed `GoSyntaxNodeLike` interface so unit tests can stub
 * without spinning up tree-sitter.
 */

/**
 * Subset of tree-sitter SyntaxNode this module reads from. Declared
 * structurally so test fixtures don't pull in the WASM runtime.
 */
export interface GoSyntaxNodeLike {
  readonly type: string
  readonly text?: string
  readonly namedChildren?: ReadonlyArray<GoSyntaxNodeLike> | null
  readonly children?: ReadonlyArray<GoSyntaxNodeLike> | null
  childForFieldName?: (name: string) => GoSyntaxNodeLike | null
}

/** Per-symbol Go enrichment payload. Always present even when fields are empty. */
export interface GoEnrichment {
  /** Method receiver info. Null when the symbol is not a method. */
  receiver: { isPointer: boolean; typeName: string } | null
  /** Method signatures inside an interface. `[]` when not an interface. */
  interfaceMethods: string[]
  /** Generic type parameters, e.g. `["T any", "U comparable"]`. `[]` when no generics. */
  typeParams: string[]
}

const METHOD_DECLARATION_TYPE = 'method_declaration'
const FUNCTION_DECLARATION_TYPE = 'function_declaration'
const TYPE_DECLARATION_TYPE = 'type_declaration'
const TYPE_SPEC_TYPE = 'type_spec'
const INTERFACE_TYPE = 'interface_type'
const PARAMETER_LIST_TYPE = 'parameter_list'
const PARAMETER_DECLARATION_TYPE = 'parameter_declaration'
const POINTER_TYPE = 'pointer_type'
const TYPE_PARAMETER_LIST_TYPE = 'type_parameter_list'
const TYPE_PARAMETER_DECLARATION_TYPE = 'parameter_declaration' // tree-sitter-go reuses this
const METHOD_ELEM_TYPE = 'method_elem'
const METHOD_SPEC_TYPE = 'method_spec'

/**
 * Extract receiver info from a method_declaration. Returns null when the
 * input is not a method or the receiver list is empty/malformed.
 *
 * Walks: method_declaration → receiver (parameter_list) →
 *        parameter_declaration → type (pointer_type | type_identifier)
 */
export function extractReceiver(node: GoSyntaxNodeLike): { isPointer: boolean; typeName: string } | null {
  if (node.type !== METHOD_DECLARATION_TYPE) return null
  const receiver =
    node.childForFieldName?.('receiver') ?? node.namedChildren?.find((c) => c.type === PARAMETER_LIST_TYPE)
  if (!receiver) return null
  const decl = receiver.namedChildren?.find((c) => c.type === PARAMETER_DECLARATION_TYPE)
  if (!decl) return null
  const typeNode =
    decl.childForFieldName?.('type') ??
    decl.namedChildren?.find((c) => c.type === POINTER_TYPE || c.type === 'type_identifier')
  if (!typeNode) return null
  if (typeNode.type === POINTER_TYPE) {
    // *T → first named child is the type
    const inner = typeNode.namedChildren?.[0]
    const name = (inner?.text ?? '').trim()
    if (!name) return null
    return { isPointer: true, typeName: name }
  }
  const name = (typeNode.text ?? '').trim()
  if (!name) return null
  return { isPointer: false, typeName: name }
}

/**
 * Extract method signatures from an interface_type. Tree-sitter Go
 * exposes them as `method_elem` (newer grammar) or `method_spec` (older);
 * this handles both. Each signature is the verbatim source text of the
 * element, which is what cross-reference consumers want.
 */
export function extractInterfaceMethods(node: GoSyntaxNodeLike): string[] {
  // Accept either a direct interface_type or a type_spec wrapping one.
  let interfaceNode: GoSyntaxNodeLike | null = null
  if (node.type === INTERFACE_TYPE) {
    interfaceNode = node
  } else if (node.type === TYPE_SPEC_TYPE) {
    const tVar = node.childForFieldName?.('type') ?? node.namedChildren?.find((c) => c.type === INTERFACE_TYPE)
    interfaceNode = tVar && tVar.type === INTERFACE_TYPE ? tVar : null
  }
  if (!interfaceNode) return []

  const out: string[] = []
  for (const child of interfaceNode.namedChildren ?? []) {
    if (child.type === METHOD_ELEM_TYPE || child.type === METHOD_SPEC_TYPE) {
      const text = (child.text ?? '').trim()
      if (text) out.push(text)
    }
  }
  return out
}

/**
 * Extract Go generic type parameters. Tree-sitter Go represents them as
 * a `type_parameter_list` containing `parameter_declaration` children
 * with `name` and `type` fields. We emit verbatim text per declaration
 * (e.g. "T any", "K comparable").
 *
 * The `type_parameter_list` lives as a field on function/method/type
 * declarations.
 */
export function extractTypeParams(node: GoSyntaxNodeLike): string[] {
  const tplist =
    node.childForFieldName?.('type_parameters') ?? node.namedChildren?.find((c) => c.type === TYPE_PARAMETER_LIST_TYPE)
  if (!tplist) return []
  const out: string[] = []
  for (const child of tplist.namedChildren ?? []) {
    if (child.type === TYPE_PARAMETER_DECLARATION_TYPE) {
      const text = (child.text ?? '').trim()
      if (text) out.push(text)
    }
  }
  return out
}

/** Compose the three enrichment fields into a single payload. */
export function enrichGoSymbol(node: GoSyntaxNodeLike): GoEnrichment {
  return {
    receiver: extractReceiver(node),
    interfaceMethods: extractInterfaceMethods(node),
    typeParams: extractTypeParams(node),
  }
}

/** True when at least one enrichment field carries useful signal. */
export function hasGoEnrichmentSignal(e: GoEnrichment): boolean {
  return e.receiver !== null || e.interfaceMethods.length > 0 || e.typeParams.length > 0
}

// Type aliases re-exported for backward compatibility with future callers.
export type { GoSyntaxNodeLike as PySyntaxNodeLikeUnused }

void METHOD_DECLARATION_TYPE
void FUNCTION_DECLARATION_TYPE
void TYPE_DECLARATION_TYPE
