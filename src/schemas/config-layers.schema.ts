/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §S3.2 — Config layering: deep merge com ordem user > project > profile > CLI.
 */

export interface LayerSource {
  name: string
  data: Record<string, unknown>
}

/**
 * Recursively merges plain objects left-to-right; later sources win for scalars,
 * nested objects merge deeply, and arrays are concatenated.
 */
export function deepMerge(...sources: Array<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = deepMerge((result[key] as Record<string, unknown>) ?? {}, value as Record<string, unknown>)
      } else if (Array.isArray(value)) {
        const existing = result[key]
        if (Array.isArray(existing)) {
          result[key] = [...existing, ...value]
        } else {
          result[key] = [...value]
        }
      } else {
        result[key] = value
      }
    }
  }

  return result
}

/** Deep-merges an ordered list of config layers into a single resolved object (last layer wins). */
export function resolveLayers(layers: LayerSource[]): Record<string, unknown> {
  const sources = layers.map((l) => l.data)
  return deepMerge(...sources)
}

/** Returns a shallow copy of each layer with its `data` cloned, decoupling callers from the originals. */
export function flattenLayers(layers: LayerSource[]): LayerSource[] {
  return layers.map((l) => ({
    name: l.name,
    data: { ...l.data },
  }))
}
