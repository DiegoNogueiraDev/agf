/*!
 * economy-scenario.schema — Zod schema for EconomyScenario fixtures.
 * Task node_19d0de1c12a2.
 *
 * WHY: Validates economy benchmark scenario JSON files at load time so
 * malformed fixtures fail fast with field-level error messages.
 *
 * Composes with: scenario-runner.ts (Scenario interface), eval-rubric.ts.
 */

import { z } from 'zod'

export const economyScenarioSchema = z.object({
  /** Unique fixture id (e.g. 'e1-low-budget'). */
  id: z.string().min(1).describe('Unique scenario identifier'),
  /** Task description / PRD passed to the agent. */
  prompt: z.string().min(1).describe('Task description or PRD'),
  /** Whether the agent is expected to resolve the task. */
  expectedResolved: z.boolean().describe('Expected resolution outcome'),
  /** Max token budget for the run (positive integer). */
  tokenBudget: z.number().int().positive().describe('Token budget cap'),
})

export type EconomyScenario = z.infer<typeof economyScenarioSchema>
