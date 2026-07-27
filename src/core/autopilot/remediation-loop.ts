/*!
 * Remediation loop for autopilot — targeted LLM-assisted repair of failing tests.
 *
 * Role: Given a failing test, send the error output + source code to an LLM for a
 * surgical fix (not a regeneration from scratch), escalating to a stronger model
 * after ESCALATION_THRESHOLD consecutive failures, and recording telemetry.
 *
 * Composes with: scenario-runner (test oracle), llm_call_ledger (token accounting),
 * provider adapters (model tier routing).
 *
 * DIP: the LLM call and test runner are injected via RemediationLlmPort so the core
 * stays pure and testable without a live LLM or test subprocess.
 */

/** Threshold of consecutive failures before escalating to a stronger model. */
const ESCALATION_THRESHOLD = 3

// ── Ports (injected by caller) ────────────────────────────────────────────────

export interface FixRequest {
  /** The error output from the failing test run. */
  errorOutput: string
  /** Current source code to repair — never regenerate from scratch. */
  sourceCode: string
  /** Resolved model tier identifier (e.g. "haiku" | "sonnet"). */
  model: string
}

export interface FixResponse {
  /** Patched source code returned by the LLM. */
  fixedCode: string
  /** Tokens consumed by this call (for ledger attribution). */
  tokensUsed: number
}

export interface TestRun {
  passed: boolean
  output: string
}

export interface RemediationLlmPort {
  fix(req: FixRequest): Promise<FixResponse>
  runTest(sourceFile: string, testFile: string): Promise<TestRun>
}

// ── Domain types ──────────────────────────────────────────────────────────────

export interface RemediationContext {
  nodeId: string
  /** Path to the source file being repaired. */
  sourceFile: string
  /** Current source code — sent as repair base to the LLM. */
  sourceCode: string
  /** Path to the test file that is failing. */
  testFile: string
  /** Full error output from the failing test run. */
  testErrorOutput: string
  /** Model to use for the first ESCALATION_THRESHOLD attempts. */
  baseModel: string
  /** Model to escalate to after ESCALATION_THRESHOLD failures. */
  escalationModel: string
  /** Maximum attempts before giving up (default: 5). */
  maxAttempts?: number
}

export interface RemediationResult {
  attempts: number
  modelUsed: string
  tokensSpent: number
  success: boolean
}

// ── Core loop ─────────────────────────────────────────────────────────────────

/**
 * Run a targeted repair loop for a failing test.
 *
 * Contract:
 *   - Each attempt sends the current error + source code to the LLM.
 *   - After ESCALATION_THRESHOLD consecutive failures the model escalates.
 *   - Returns a ledger record: attempts / model_used / tokens_spent / success.
 *   - Never regenerates from scratch — always sends the current source as the base.
 */
export async function runRemediationLoop(ctx: RemediationContext, llm: RemediationLlmPort): Promise<RemediationResult> {
  const maxAttempts = ctx.maxAttempts ?? 5
  let attempts = 0
  let tokensSpent = 0
  let currentCode = ctx.sourceCode
  let lastModel = ctx.baseModel

  for (let i = 0; i < maxAttempts; i++) {
    const model = i >= ESCALATION_THRESHOLD ? ctx.escalationModel : ctx.baseModel
    lastModel = model

    const fixResponse = await llm.fix({
      errorOutput: ctx.testErrorOutput,
      sourceCode: currentCode,
      model,
    })

    tokensSpent += fixResponse.tokensUsed
    currentCode = fixResponse.fixedCode
    attempts++

    const testRun = await llm.runTest(ctx.sourceFile, ctx.testFile)
    if (testRun.passed) {
      return { attempts, modelUsed: model, tokensSpent, success: true }
    }
  }

  return { attempts, modelUsed: lastModel, tokensSpent, success: false }
}
