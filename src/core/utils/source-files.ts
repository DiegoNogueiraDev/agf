/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readdir } from 'node:fs/promises'

const SOURCE_EXTENSIONS = new Set(['.go', '.ts', '.tsx', '.js', '.jsx'])

/** Returns true if `dir` contains at least one recognisable source file (recursive). */
export async function hasSourceFiles(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true })
    return entries.some((e) => {
      if (!e.isFile()) return false
      const name = String(e.name)
      const dot = name.lastIndexOf('.')
      return dot !== -1 && SOURCE_EXTENSIONS.has(name.slice(dot))
    })
  } catch {
    return false
  }
}
