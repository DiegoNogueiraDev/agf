/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Centralized path sanitization utility.
 * Prevents path traversal attacks (Bug #003, #004).
 */

import path from 'node:path'
import { McpGraphError } from './errors.js'

/**
 * Error thrown when a path traversal attack is detected.
 */
export class PathTraversalError extends McpGraphError {
  constructor(
    public readonly candidatePath: string,
    reason: string,
  ) {
    super(`Path traversal detected: ${reason} (candidate: "${candidatePath}")`)
    this.name = 'PathTraversalError'
  }
}

/**
 * Decode URL-encoded sequences in a string.
 * Handles single (%2e) and double (%252e) encoding.
 */
function decodeUrlEncoded(input: string): string {
  let decoded = input
  // Double-decode to catch %252e → %2e → .
  try {
    decoded = decodeURIComponent(decodeURIComponent(decoded))
  } catch {
    try {
      decoded = decodeURIComponent(decoded)
    } catch (_err) {
      void _err // Not URL-encoded — keep original
    }
  }
  return decoded
}

/**
 * Normalize Unicode fullwidth characters to ASCII equivalents.
 * Prevents bypass via ．．/ (fullwidth dots + slash).
 */
function normalizeUnicode(input: string): string {
  // Replace fullwidth dot (U+FF0E) with regular dot
  // Replace fullwidth solidus (U+FF0F) with regular slash
  // Replace fullwidth reverse solidus (U+FF3C) with regular backslash
  return input
    .replace(/\uFF0E/g, '.')
    .replace(/\uFF0F/g, '/')
    .replace(/\uFF3C/g, '\\')
}

/**
 * Assert that a candidate path resolves to a location inside the allowed root.
 * Returns the resolved canonical path if safe, throws PathTraversalError otherwise.
 *
 * @param candidate - The user-provided path (relative or absolute)
 * @param allowedRoot - The directory the path must stay inside
 * @returns The resolved absolute path
 * @throws PathTraversalError if the path escapes the allowed root
 */
export function assertPathInside(candidate: string, allowedRoot: string): string {
  // Reject empty paths
  if (!candidate || candidate.trim() === '') {
    throw new PathTraversalError(candidate, 'empty path')
  }

  // Reject null bytes
  if (candidate.includes('\0')) {
    throw new PathTraversalError(candidate, 'null byte in path')
  }

  // Decode URL-encoded sequences before validation
  const decoded = decodeUrlEncoded(candidate)

  // Normalize Unicode characters
  const normalized = normalizeUnicode(decoded)

  // Reject null bytes after decoding
  if (normalized.includes('\0')) {
    throw new PathTraversalError(candidate, 'null byte after decoding')
  }

  // Normalize backslashes to forward slashes for consistent checks
  const withForwardSlashes = normalized.replace(/\\/g, '/')

  // Check for traversal patterns after all normalization
  if (withForwardSlashes.includes('..')) {
    throw new PathTraversalError(candidate, "path contains '..' traversal")
  }

  // Resolve the final path
  const resolvedRoot = path.resolve(allowedRoot)
  const resolvedCandidate = path.resolve(resolvedRoot, candidate)

  // Final containment check
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(resolvedRoot + path.sep)) {
    throw new PathTraversalError(candidate, 'resolved path escapes allowed root')
  }

  return resolvedCandidate
}
