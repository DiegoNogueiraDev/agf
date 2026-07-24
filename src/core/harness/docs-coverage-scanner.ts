/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Rules & Docs Coverage Scanner — Harnessability Metric dimension
 *
 * Checks for CLAUDE.md, README.md, .claude/rules/ coverage, and docs/ directory.
 * Score: weighted combination of documentation completeness.
 */

export interface DocsCoverageInput {
  hasClaudeMd: boolean
  hasReadme: boolean
  rulesCount: number
  srcDirsCount: number
  hasDocsDir: boolean
}

export interface DocsCoverageResult {
  docsScore: number
  hasClaudeMd: boolean
  hasReadme: boolean
  rulesCount: number
  dirsCount: number
}

/**
 * Score documentation coverage.
 * Weights: CLAUDE.md (30%), README.md (20%), rules coverage (30%), docs dir (20%)
 */
export function scanDocsCoverage(input: DocsCoverageInput): DocsCoverageResult {
  let score = 0

  // CLAUDE.md = 30 points
  if (input.hasClaudeMd) score += 30

  // README.md = 20 points
  if (input.hasReadme) score += 20

  // Rules coverage = 30 points (proportional to dirs covered)
  if (input.srcDirsCount > 0) {
    const rulesCoverage = Math.min(input.rulesCount / input.srcDirsCount, 1)
    score += Math.round(rulesCoverage * 30)
  } else {
    score += 30 // no dirs = full score
  }

  // Docs directory = 20 points
  if (input.hasDocsDir) score += 20

  return {
    docsScore: Math.round(score),
    hasClaudeMd: input.hasClaudeMd,
    hasReadme: input.hasReadme,
    rulesCount: input.rulesCount,
    dirsCount: input.srcDirsCount,
  }
}
