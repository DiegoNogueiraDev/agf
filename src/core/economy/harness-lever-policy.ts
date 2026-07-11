/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { existsSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { runHarnessScanCached } from '../harness/harness-cache.js'
import type { HarnessScanResult } from '../harness/harness-scan-runner.js'

const TESTS_THRESHOLD = 70
const TYPES_THRESHOLD = 80

export interface LeverPlan {
  compress: boolean
  cavemanInput: boolean
  contentDispatch: boolean
  skeletonize: boolean
  ccr: boolean
  cacheAligner: boolean
  aggressiveness: number
  lossyCodeAllowed: boolean
  tier: 'standard' | 'cheap' | 'frontier'
  forceTscOnLowTypes: boolean
}

export function harnessLeverPolicy(scan: HarnessScanResult): LeverPlan {
  const testsScore = scan.breakdown.tests.score
  const typesScore = scan.breakdown.types.score
  const grade = scan.grade

  const isGradeAB = grade === 'A' || grade === 'B'
  const highTests = testsScore >= TESTS_THRESHOLD

  const lossyCodeAllowed = isGradeAB && highTests
  const forceTscOnLowTypes = typesScore < TYPES_THRESHOLD

  let aggressiveness: number
  if (lossyCodeAllowed) {
    aggressiveness = 0.7 + (scan.score - 70) / 100
    aggressiveness = Math.min(aggressiveness, 1)
  } else if (isGradeAB) {
    aggressiveness = 0.4
  } else if (grade === 'C') {
    aggressiveness = 0.3
  } else {
    aggressiveness = 0.1
  }

  let tier: LeverPlan['tier']
  if (grade === 'D') {
    tier = 'frontier'
  } else if (grade === 'C') {
    tier = 'cheap'
  } else {
    tier = 'standard'
  }

  return {
    compress: true,
    cavemanInput: lossyCodeAllowed || grade !== 'D',
    contentDispatch: true,
    skeletonize: isGradeAB,
    ccr: lossyCodeAllowed,
    cacheAligner: isGradeAB,
    aggressiveness,
    lossyCodeAllowed,
    tier,
    forceTscOnLowTypes,
  }
}

export const DEFAULT_PLAN: LeverPlan = {
  compress: true,
  cavemanInput: true,
  contentDispatch: true,
  skeletonize: false,
  ccr: false,
  cacheAligner: false,
  aggressiveness: 0.3,
  lossyCodeAllowed: false,
  tier: 'cheap',
  forceTscOnLowTypes: false,
}

export function resolveLeverPlan(rootDir?: string, db?: Database.Database): LeverPlan {
  try {
    // rootDir inválido/inexistente → plano conservador (não habilita edits lossy).
    // (runHarnessScan agora é robusto a projetos sem src/, então a validade do
    // rootDir precisa ser checada aqui explicitamente.)
    const scan = rootDir && existsSync(rootDir) ? runHarnessScanCached(rootDir, db) : null
    if (scan) return harnessLeverPolicy(scan)
    return DEFAULT_PLAN
  } catch {
    return DEFAULT_PLAN
  }
}
