/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * java-concat — pasting two .java sources back-to-back for joint
 * compilation left the second file's imports after the first file's class
 * declaration, which is invalid Java syntax (imports/package must precede
 * every type declaration). concatJavaSources hoists all import/package
 * statements from every file to the top (deduplicated, in first-seen
 * order), then concatenates the remaining class/method bodies below.
 */

const HEADER_LINE_RE = /^(?:import\s+[\w.*]+\s*;|package\s+[\w.]+\s*;)$/

interface SplitSource {
  headers: string[]
  body: string
}

function splitHeaders(source: string): SplitSource {
  const headers: string[] = []
  const bodyLines: string[] = []
  for (const line of source.split('\n')) {
    if (HEADER_LINE_RE.test(line.trim())) {
      headers.push(line.trim())
    } else {
      bodyLines.push(line)
    }
  }
  return { headers, body: bodyLines.join('\n').trim() }
}

/** Concatenate Java sources for joint compilation, hoisting imports/package statements to the top. */
export function concatJavaSources(files: string[]): string {
  const seenHeaders = new Set<string>()
  const orderedHeaders: string[] = []
  const bodies: string[] = []

  for (const file of files) {
    const { headers, body } = splitHeaders(file)
    for (const header of headers) {
      if (!seenHeaders.has(header)) {
        seenHeaders.add(header)
        orderedHeaders.push(header)
      }
    }
    if (body.length > 0) bodies.push(body)
  }

  const bodyBlock = bodies.join('\n\n')
  if (orderedHeaders.length === 0) return bodyBlock
  return `${orderedHeaders.join('\n')}\n\n${bodyBlock}`
}
