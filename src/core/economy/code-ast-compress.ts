/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * AST-aware lossy code compressor (Task A6).
 *
 * Drops function/method BODIES while keeping their SIGNATURES (name, params,
 * return type, modifiers, export keywords) plus all imports, exports, types and
 * interfaces, so a large TS/JS blob shrinks but stays structurally legible.
 *
 * SAFETY: this is JUST the `transform`. It is meant to be fed through
 * {@link applyLossyTransform} with `kind: 'code'`, which runs `createCodeVerify`
 * (exported top-level names preserved) and `createErrorPreserveVerify`,
 * reverting if either fails, and (with a `ccr` store) caches the original so the
 * drop is reversible. The compressor never guarantees correctness on its own —
 * the gate does.
 *
 * Tooling: uses **ts-morph** (already a dependency) to walk function-like nodes
 * and replace their block bodies, since the primary language is TS/JS — exactly
 * what `createCodeVerify` validates via the TS compiler.
 *
 * NOTE: pipeline wiring is a deliberate follow-up. This compressor is opt-in via
 * the gate and is NOT wired into `content-router.ts`'s default code path (which
 * keeps tool-compress lossless).
 */

import { Node, Project, ScriptKind } from 'ts-morph'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'code-ast-compress' })

/** Compact placeholder that replaces a dropped body block. */
const BODY_PLACEHOLDER = '{ /* … */ }'

/**
 * Compress TS/JS source by replacing function/method/arrow bodies with a compact
 * placeholder, preserving signatures, imports, exports, types and interfaces.
 *
 * Deterministic and pure: same input → same output, no side effects on the
 * caller. If parsing fails or the result is not smaller, the input is returned
 * unchanged.
 *
 * @param code TypeScript/JavaScript source.
 * @returns The body-stripped source, or `code` unchanged on failure / no gain.
 */
export function astCompressCode(code: string): string {
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions: { allowJs: true },
    })

    const sourceFile = project.createSourceFile('__ast_compress__.tsx', code, {
      scriptKind: ScriptKind.TSX,
      overwrite: true,
    })

    // Collect bodies first, then mutate; mutating during traversal invalidates
    // positions. We replace the deepest-first to keep ranges stable.
    const bodies: Node[] = []

    sourceFile.forEachDescendant((node) => {
      if (
        Node.isFunctionDeclaration(node) ||
        Node.isMethodDeclaration(node) ||
        Node.isArrowFunction(node) ||
        Node.isFunctionExpression(node) ||
        Node.isConstructorDeclaration(node) ||
        Node.isGetAccessorDeclaration(node) ||
        Node.isSetAccessorDeclaration(node)
      ) {
        const body = node.getBody()
        if (body && Node.isBlock(body)) {
          bodies.push(body)
        }
      }
    })

    if (bodies.length === 0) return code

    // Replace bottom-up (by descending start position) so earlier replacements
    // do not shift the offsets of later, still-pending ones.
    bodies
      .sort((a, b) => b.getStart() - a.getStart())
      .forEach((body) => {
        body.replaceWithText(BODY_PLACEHOLDER)
      })

    const out = sourceFile.getFullText()

    if (out.length >= code.length) return code

    return out
  } catch (err) {
    log.debug('astCompressCode parse/transform failed; returning input unchanged', {
      error: err instanceof Error ? err.message : String(err),
    })
    return code
  }
}
