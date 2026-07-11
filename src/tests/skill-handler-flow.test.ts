/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Verifica estrutura dos handlers: classe exportada, implementa SkillHandlerPort,
 * método execute. Teste de compliance — cada handler deve existir e seguir
 * o padrão Mandatory Flow (onProgress steps alinhados ao SKILL.md).
 */
import { describe, it, expect } from 'vitest'
import type { SkillHandlerPort } from '../tui/skill-handler-port.js'

interface HandlerManifest {
  phase: string
  name: string
  importPath: string
  className: string
  mandatorySteps: number
}

const HANDLERS: HandlerManifest[] = [
  {
    phase: 'analyze',
    name: 'graph-analyze',
    importPath: '../skills/analyze/graph-analyze.js',
    className: 'GraphAnalyzeHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'analyze',
    name: 'graph-prd',
    importPath: '../skills/analyze/graph-prd.js',
    className: 'GraphPrdHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'design',
    name: 'graph-design',
    importPath: '../skills/design/graph-design.js',
    className: 'GraphDesignHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'plan',
    name: 'graph-plan',
    importPath: '../skills/plan/graph-plan.js',
    className: 'GraphPlanHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'implement',
    name: 'graph-implement',
    importPath: '../skills/implement/graph-implement.js',
    className: 'GraphImplementHandler',
    mandatorySteps: 5,
  },
  {
    phase: 'implement',
    name: 'graph-bugs',
    importPath: '../skills/implement/graph-bugs.js',
    className: 'GraphBugsHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'validate',
    name: 'graph-validate',
    importPath: '../skills/validate/graph-validate.js',
    className: 'GraphValidateHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'validate',
    name: 'graph-platform',
    importPath: '../skills/validate/graph-platform.js',
    className: 'GraphPlatformHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'review',
    name: 'graph-review',
    importPath: '../skills/review/graph-review.js',
    className: 'GraphReviewHandler',
    mandatorySteps: 5,
  },
  {
    phase: 'review',
    name: 'graph-security',
    importPath: '../skills/review/graph-security.js',
    className: 'GraphSecurityHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'review',
    name: 'graph-quality',
    importPath: '../skills/review/graph-quality.js',
    className: 'GraphQualityHandler',
    mandatorySteps: 5,
  },
  {
    phase: 'handoff',
    name: 'graph-handoff',
    importPath: '../skills/handoff/graph-handoff.js',
    className: 'GraphHandoffHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'deploy',
    name: 'graph-deploy',
    importPath: '../skills/deploy/graph-deploy.js',
    className: 'GraphDeployHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'listening',
    name: 'graph-listening',
    importPath: '../skills/listening/graph-listening.js',
    className: 'GraphListeningHandler',
    mandatorySteps: 4,
  },
  {
    phase: 'cross-cutting',
    name: 'graph-heal',
    importPath: '../skills/cross-cutting/graph-heal.js',
    className: 'GraphHealHandler',
    mandatorySteps: 4,
  },
]

describe('Mandatory Flow — estrutura dos handlers', () => {
  for (const manifest of HANDLERS) {
    it(`${manifest.name} — exporta classe ${manifest.className} implementando SkillHandlerPort`, async () => {
      const mod = await import(manifest.importPath)
      const HandlerClass = mod[manifest.className] as new () => SkillHandlerPort
      expect(HandlerClass).toBeDefined()
      expect(typeof HandlerClass).toBe('function')

      const handler = new HandlerClass()
      expect(typeof handler.execute).toBe('function')
    })
  }
})
