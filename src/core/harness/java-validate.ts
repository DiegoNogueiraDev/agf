/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * java-validate — Java allows only one public top-level type per
 * compilation unit. Concatenating two .java sources for joint compilation
 * broke twice with a cryptic javac error only discovered at build time.
 * countPublicTypes catches it deterministically, before javac ever runs.
 */

const PUBLIC_TYPE_RE = /\bpublic\s+(?:final\s+)?(?:class|interface|enum|record)\s+\w+/g

export interface PublicTypeCountResult {
  count: number
  valid: boolean
  error?: string
}

/** Count public class/interface/enum/record declarations in a Java compilation unit. */
export function countPublicTypes(source: string): PublicTypeCountResult {
  const matches = source.match(PUBLIC_TYPE_RE)
  const count = matches ? matches.length : 0
  const valid = count <= 1

  return valid
    ? { count, valid }
    : {
        count,
        valid,
        error: `Java allows only one public type per file — found ${count} (${matches!.join(', ')})`,
      }
}
