/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * java-joint-compile-check — wires concatJavaSources + countPublicTypes into
 * one pre-compile validation: concatenate every .java file under a directory
 * the way agf would for joint compilation, then verify the result still has
 * at most one public top-level type before javac ever runs.
 *
 * Composes with: java-concat.ts, java-validate.ts (sources), harness-cmd.ts (consumer).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { concatJavaSources } from './java-concat.js'
import { countPublicTypes, type PublicTypeCountResult } from './java-validate.js'

export interface JavaJointCompileResult {
  /** .java file paths, relative to `dir`. */
  files: string[]
  concatenated: string
  publicTypes: PublicTypeCountResult
}

function gatherJavaFiles(dir: string): string[] {
  const results: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      results.push(...gatherJavaFiles(full))
    } else if (entry.endsWith('.java')) {
      results.push(full)
    }
  }
  return results
}

/** Concatenate every .java file under `dir` for joint compilation and validate the result has ≤1 public type. */
export function checkJavaJointCompilation(dir: string): JavaJointCompileResult {
  const files = gatherJavaFiles(dir).sort()
  const sources = files.map((f) => readFileSync(f, 'utf8'))
  const concatenated = concatJavaSources(sources)
  const publicTypes = countPublicTypes(concatenated)

  return {
    files: files.map((f) => relative(dir, f)),
    concatenated,
    publicTypes,
  }
}
