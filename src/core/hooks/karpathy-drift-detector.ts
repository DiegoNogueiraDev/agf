/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC — Task 2.1: Hook de drift karpathy
 *
 * Pure function — no I/O. Callers read vendor/rules files and pass content strings.
 */

export interface KarpathyDrift {
  addedInVendor: string[]
  removedFromRules: string[]
  modified: string[]
}

interface Section {
  heading: string
  normalizedHeading: string
  body: string
}

function normalizeHeading(heading: string): string {
  // Strip §tag annotations (e.g. "§karpathy-1", "§karpathy-extra") and trim
  return heading.replace(/§\S+/g, '').trim().toLowerCase()
}

function normalizeBody(body: string): string {
  // Collapse runs of whitespace to a single space; trim
  return body.replace(/\s+/g, ' ').trim()
}

function parseSections(content: string): Section[] {
  const sections: Section[] = []
  const lines = content.split('\n')
  let currentHeading: string | null = null
  const bodyLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          normalizedHeading: normalizeHeading(currentHeading),
          body: normalizeBody(bodyLines.join('\n')),
        })
        bodyLines.length = 0
      }
      currentHeading = line.slice(3).trim()
    } else if (currentHeading !== null) {
      bodyLines.push(line)
    }
  }

  if (currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      normalizedHeading: normalizeHeading(currentHeading),
      body: normalizeBody(bodyLines.join('\n')),
    })
  }

  return sections
}

export function detectKarpathyDrift(vendorContent: string, rulesContent: string): KarpathyDrift {
  const vendorSections = parseSections(vendorContent)
  const rulesSections = parseSections(rulesContent)

  const vendorMap = new Map<string, Section>(vendorSections.map((s) => [s.normalizedHeading, s]))
  const rulesMap = new Map<string, Section>(rulesSections.map((s) => [s.normalizedHeading, s]))

  const addedInVendor: string[] = []
  const removedFromRules: string[] = []
  const modified: string[] = []

  for (const [key, vendorSection] of vendorMap) {
    if (!rulesMap.has(key)) {
      addedInVendor.push(vendorSection.heading)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
      const rulesSection = rulesMap.get(key)!
      if (vendorSection.body !== rulesSection.body) {
        modified.push(`${vendorSection.heading} (vendor) vs ${rulesSection.heading} (rules)`)
      }
    }
  }

  for (const [key, rulesSection] of rulesMap) {
    if (!vendorMap.has(key)) {
      removedFromRules.push(rulesSection.heading.replace(/§\S+/g, '').trim())
    }
  }

  return { addedInVendor, removedFromRules, modified }
}
