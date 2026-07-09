/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Definition of Done — composite gate for IMPLEMENT task completion.
 * Validates 9 checks (4 required + 5 recommended) before marking a task as done.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { ImplementDoneReport, DodCheck } from '../../schemas/implementer-schema.js'
import { validateAcQuality } from '../analyzer/ac-validator.js'
import { parseAc } from '../analyzer/ac-parser.js'
import { scoreAcTestability } from '../analyzer/ac-testability.js'
import { nodeHasAc, getNodeAcTexts } from '../utils/ac-helpers.js'
import { findTransitiveBlockers } from '../planner/dependency-chain.js'
import { scoreToGrade } from '../utils/grading.js'
import { XP_SIZE_ORDER } from '../utils/xp-sizing.js'
import { createLogger } from '../utils/logger.js'
import { isCorePath } from '../citations/citation-validator.js'
import { hasCitation } from '../citations/citation-extractor.js'
import { getTouchedFiles } from '../planner/touched-files.js'
import { evaluateComplexityBudget } from './complexity-budget.js'
import { evaluateSurgicalScope } from './surgical-scope.js'
import { hasKnowledgeEntry } from '../knowledge/knowledge-check.js'
import { summarizeLedger } from '../observability/llm-call-ledger.js'
import type Database from 'better-sqlite3'
import { findRule } from '../harness/remediation-rules.js'
import { discoverTestFiles } from '../harness/test-discovery.js'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join as joinPath, isAbsolute } from 'node:path'
import { detectStaleSourceRef } from '../hooks/stale-source-ref.js'

const log = createLogger({ layer: 'core', source: 'definition-of-done.ts' })

const LARGE_XP_THRESHOLD = 4 // L=4, XL=5

/**
 * Check Definition of Done for a specific task node.
 */
export interface DodOptions {
  db?: Database.Database
  /** Project root — enables the has_test_files auto-discovery fallback (test-discovery.ts). */
  dir?: string
}

export function checkDefinitionOfDone(doc: GraphDocument, nodeId: string, opts: DodOptions = {}): ImplementDoneReport {
  const node = doc.nodes.find((n) => n.id === nodeId)
  const checks: DodCheck[] = []

  if (!node) {
    return {
      nodeId,
      title: '(not found)',
      checks: [],
      ready: false,
      score: 0,
      grade: 'F',
      summary: `Node "${nodeId}" não encontrado no grafo`,
    }
  }

  // ── Required checks ──

  // 1. has_acceptance_criteria — task or parent has AC (inline or child AC nodes)
  const hasAc = nodeHasAc(doc, nodeId)
  const parentHasAc = node.parentId ? nodeHasAc(doc, node.parentId) : false
  const acPass = !!(hasAc || parentHasAc)
  checks.push({
    name: 'has_acceptance_criteria',
    passed: acPass,
    details: acPass
      ? `AC definidos${parentHasAc && !hasAc ? ' (herdado do parent)' : ''}`
      : 'Nenhum acceptance criteria definido no node ou parent',
    severity: 'required',
  })

  // 2. ac_quality_pass — AC score >= 60
  if (hasAc) {
    const acReport = validateAcQuality(doc, nodeId)
    const nodeReport = acReport.nodes.find((r) => r.nodeId === nodeId)
    const acScore = nodeReport?.score ?? 0
    const acQualityPass = acScore >= 60
    checks.push({
      name: 'ac_quality_pass',
      passed: acQualityPass,
      details: acQualityPass
        ? `AC quality score: ${acScore} (mínimo: 60)`
        : `AC quality score: ${acScore} — abaixo do mínimo de 60`,
      severity: 'required',
    })
  } else {
    checks.push({
      name: 'ac_quality_pass',
      passed: false,
      details: 'Sem AC para avaliar qualidade',
      severity: 'required',
    })
  }

  // 3. no_unresolved_blockers — no depends_on non-done nodes
  const blockers = findTransitiveBlockers(doc, nodeId)
  const unresolvedBlockers = blockers.filter((b) => b.status !== 'done')
  const noBlockers = unresolvedBlockers.length === 0
  checks.push({
    name: 'no_unresolved_blockers',
    passed: noBlockers,
    details: noBlockers
      ? 'Sem blockers não-resolvidos'
      : `${unresolvedBlockers.length} blocker(s) pendente(s): ${unresolvedBlockers.map((b) => b.id).join(', ')}`,
    severity: 'required',
  })

  // 4. status_flow_valid — must have been in_progress or done
  const validStatuses = new Set(['in_progress', 'done'])
  const statusValid = validStatuses.has(node.status)
  checks.push({
    name: 'status_flow_valid',
    passed: statusValid,
    details: statusValid
      ? `Status atual: ${node.status}`
      : `Status "${node.status}" — deve passar por in_progress antes de done`,
    severity: 'required',
  })

  // ── Recommended checks ──

  // 5. has_description — non-empty description
  const hasDesc = !!(node.description && node.description.trim().length > 0)
  checks.push({
    name: 'has_description',
    passed: hasDesc,
    details: hasDesc ? 'Descrição definida' : 'Sem descrição — recomendado adicionar contexto',
    severity: 'recommended',
  })

  // 6. not_oversized — not L/XL without subtasks
  const sizeOrder = XP_SIZE_ORDER[node.xpSize ?? 'M'] ?? 3
  const isLarge = sizeOrder >= LARGE_XP_THRESHOLD
  const hasChildren = doc.nodes.some((n) => n.parentId === node.id)
  const notOversized = !isLarge || hasChildren
  checks.push({
    name: 'not_oversized',
    passed: notOversized,
    details: notOversized
      ? isLarge
        ? `Task ${node.xpSize} com subtasks — ok`
        : `Task ${node.xpSize ?? 'M'} — tamanho adequado`
      : `Task ${node.xpSize} sem subtasks — considerar decomposição`,
    severity: 'recommended',
  })

  // 7. has_testable_ac — at least 1 AC is testable and strong_concrete
  const acs = getNodeAcTexts(doc, nodeId)
  const parsedAcs = acs.map((ac) => parseAc(ac))
  const testableCount = parsedAcs.filter((p) => p.isTestable).length
  const scoredAcs = acs.map((ac) => scoreAcTestability(ac))
  const strongConcreteCount = scoredAcs.filter((r) => r.concreteLabel === 'strong_concrete').length
  const allWeak = acs.length > 0 && strongConcreteCount === 0
  const hasTestableAc = testableCount > 0 && !allWeak
  const weakAcExamples = allWeak
    ? scoredAcs
        .filter((r) => r.concreteLabel === 'weak_concrete')
        .slice(0, 2)
        .map((r) => `"${r.ac.slice(0, 60)}…"`)
        .join(', ')
    : ''
  checks.push({
    name: 'has_testable_ac',
    passed: hasTestableAc,
    details: hasTestableAc
      ? `${testableCount}/${acs.length} AC(s) testáveis, ${strongConcreteCount} com valor concreto`
      : allWeak
        ? `Todos os ACs são weak_concrete (sem threshold numérico, status code ou estado booleano) — exemplos: ${weakAcExamples}. Adicione valores concretos observáveis.`
        : 'Nenhum AC testável — adicionar assertions concretas',
    severity: 'recommended',
  })

  // 8. has_test_files — test file paths linked to ACs, falling back to
  // keyword-based auto-discovery (test-discovery.ts) when none are declared.
  const declaredTestFiles = node.testFiles?.length ?? 0
  const discovered = !declaredTestFiles && opts.dir ? discoverTestFiles(node.title, opts.dir) : []
  const hasTestFiles = declaredTestFiles > 0 || discovered.length > 0
  checks.push({
    name: 'has_test_files',
    passed: hasTestFiles,
    details: declaredTestFiles
      ? `${declaredTestFiles} test file(s) linked`
      : discovered.length > 0
        ? `${discovered.length} test file(s) auto-discovered by title keywords: ${discovered.join(', ')}`
        : 'No test files linked — consider adding testFiles',
    severity: 'recommended',
  })

  // 9. has_estimate — xpSize or estimateMinutes defined
  const hasEstimate = !!(node.xpSize || node.estimateMinutes)
  checks.push({
    name: 'has_estimate',
    passed: hasEstimate,
    details: hasEstimate
      ? `Estimativa: ${node.xpSize ? `size=${node.xpSize}` : ''}${node.estimateMinutes ? ` ${node.estimateMinutes}min` : ''}`.trim()
      : 'Sem estimativa — recomendado definir xpSize ou estimateMinutes',
    severity: 'recommended',
  })

  // §EPIC-13.1 — has_citations_in_new_core_files
  // Verifies that every src/core/* file the task touched contains at least
  // one §EPIC-/§ADR- citation comment. Recommended severity: a missing
  // citation deducts from the AC quality score (5pts per file).
  const touched = getTouchedFiles(node)
  const coreTouched = touched.filter(isCorePath)
  let citationViolations = 0
  let citationChecked = 0
  for (const path of coreTouched) {
    const abs = isAbsolute(path) ? path : joinPath(process.cwd(), path)
    if (!existsSync(abs)) continue
    citationChecked++
    try {
      const content = readFileSync(abs, 'utf8')
      if (!hasCitation(content)) citationViolations++
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: 'unreadable — skip, do not block on FS hiccup' })
    }
  }
  const citationsPass = citationViolations === 0
  const citationDetails =
    coreTouched.length === 0
      ? 'Sem arquivos core/ tocados — check N/A'
      : citationsPass
        ? `${citationChecked}/${coreTouched.length} arquivo(s) core com citation §EPIC/§ADR`
        : `${citationViolations}/${citationChecked} arquivo(s) core sem citation §EPIC/§ADR — adicionar âncora à spec`
  checks.push({
    name: 'has_citations_in_new_core_files',
    passed: citationsPass,
    details: citationDetails,
    severity: 'recommended',
  })

  // §EPIC-21.T03 — stale_source_ref_pass
  // Detects when a node's sourceRef (file it was scoped from, e.g. via PRD
  // import) has drifted substantially since node creation — the spec may be
  // stale. baselineLineCount comes from sourceRef's own startLine/endLine
  // (already populated by prd-to-graph.ts); no schema change needed. Skips
  // gracefully when sourceRef is absent or lacks a line range.
  let staleSourceRefPassed = true
  let staleSourceRefDetails = 'Sem sourceRef ou sem range de linhas — check N/A'
  if (node.sourceRef?.startLine !== undefined && node.sourceRef?.endLine !== undefined) {
    const baseDir = opts.dir ?? process.cwd()
    const abs = isAbsolute(node.sourceRef.file) ? node.sourceRef.file : joinPath(baseDir, node.sourceRef.file)
    if (existsSync(abs)) {
      try {
        const stat = statSync(abs)
        const currentLineCount = readFileSync(abs, 'utf8').split('\n').length
        const result = detectStaleSourceRef({
          createdAtMs: Date.parse(node.createdAt),
          mtimeMs: stat.mtimeMs,
          currentLineCount,
          baselineLineCount: node.sourceRef.endLine - node.sourceRef.startLine,
        })
        staleSourceRefPassed = !result.stale
        staleSourceRefDetails = result.stale
          ? `sourceRef "${node.sourceRef.file}" pode estar desatualizado: ${result.reason}`
          : `sourceRef "${node.sourceRef.file}" ok (${result.ageDays.toFixed(1)}d, ${(result.locDelta * 100).toFixed(0)}% LOC drift)`
      } catch (err) {
        log.debug('intentional-swallow', { error: String(err), reason: 'unreadable — skip, do not block on FS hiccup' })
      }
    } else {
      staleSourceRefDetails = `sourceRef "${node.sourceRef.file}" não existe mais no disco`
    }
  }
  checks.push({
    name: 'stale_source_ref_pass',
    passed: staleSourceRefPassed,
    details: staleSourceRefDetails,
    severity: 'recommended',
  })

  // §KARPATHY-2 — complexity_budget_pass
  // Karpathy principle 2 (Simplicity First). Heuristic: file > 200 LOC without
  // subtasks, or impl:test LOC ratio > 5:1. Recommended severity. Skips
  // gracefully when no implementation files are declared.
  const implFiles = touched.map((p) => (isAbsolute(p) ? p : joinPath(process.cwd(), p)))
  const testFilesAbs = (node.testFiles ?? []).map((p) => (isAbsolute(p) ? p : joinPath(process.cwd(), p)))
  const complexityResult = evaluateComplexityBudget({
    implementationFiles: implFiles,
    testFiles: testFilesAbs,
    hasChildren,
  })
  checks.push({
    name: 'complexity_budget_pass',
    passed: complexityResult.passed,
    details: complexityResult.details,
    severity: 'recommended',
  })

  // §KARPATHY-3 — surgical_scope_pass
  // Karpathy principle 3 (Surgical Changes). Compares declared scope
  // (metadata.declaredFiles) against actual touched files. Skips gracefully
  // when no declared scope exists on the node — avoids false positives.
  const declaredFiles = ((node.metadata as Record<string, unknown> | undefined)?.declaredFiles ?? []) as string[]
  const surgicalResult = evaluateSurgicalScope({
    declaredFiles: Array.isArray(declaredFiles) ? declaredFiles : [],
    modifiedFiles: touched,
  })
  checks.push({
    name: 'surgical_scope_pass',
    passed: surgicalResult.passed,
    details: surgicalResult.details,
    severity: 'recommended',
  })

  // §ECONOMY-HOOK: check 10 — economy awareness (ledger-aware, trigger-based)
  // Cross-checks the real llm_call_ledger for THIS task: only flag waste when the
  // task actually SPENT LLM tokens with no economy lever. A delegate-first task
  // (0 LLM calls) has nothing to optimize → passes. Description text is gameable,
  // so this reads the ledger, not prose.
  const economyFlags = (node.metadata as Record<string, unknown> | undefined)?.economyFlags
  const hasEconomyFlags = !!(
    economyFlags &&
    typeof economyFlags === 'object' &&
    Object.keys(economyFlags as object).length > 0
  )
  const taskMetric = opts.db ? summarizeLedger(opts.db).byTask.find((t) => t.nodeId === nodeId) : undefined
  const spentTokens = (taskMetric?.tokensIn ?? 0) + (taskMetric?.tokensOut ?? 0)
  const usedCache = (taskMetric?.cachedTokensIn ?? 0) > 0
  // Aware when: economy flags present, OR the task hit the cache, OR it spent
  // nothing locally (delegate-first — no LLM billed here, nothing to optimize).
  const economyAware = hasEconomyFlags || usedCache || spentTokens === 0
  let economyDetails: string
  if (spentTokens === 0) {
    economyDetails = 'Nenhum token LLM gasto nesta task (delegate-first) — nada a otimizar'
  } else if (hasEconomyFlags) {
    economyDetails = `Economy flags registrados: ${JSON.stringify(economyFlags)}`
  } else if (usedCache) {
    economyDetails = `Cache cobriu ${(taskMetric?.cachedTokensIn ?? 0).toLocaleString()} tokens de entrada`
  } else {
    economyDetails =
      `Task gastou ${spentTokens.toLocaleString()} tokens LLM (${taskMetric?.calls ?? 0} calls, ` +
      `$${(taskMetric?.costUsd ?? 0).toFixed(4)}) sem nenhuma lever/cache/projeção — rotear via agf ` +
      `(cache, --select/--compressed, agf economy on <lever>, provider/tier cheap)`
  }
  checks.push({
    name: 'economy_awareness',
    passed: economyAware,
    details: economyDetails,
    severity: 'recommended',
  })

  // §E2.4 — check 13 — knowledge_store_entry (recommended)
  if (opts.db) {
    const hasKnowledge = hasKnowledgeEntry(opts.db, nodeId)
    checks.push({
      name: 'knowledge_store_entry',
      passed: hasKnowledge,
      details: hasKnowledge
        ? `Knowledge store tem entrada para ${nodeId}`
        : `Knowledge store sem entrada para ${nodeId} — considere indexar o contexto desta task`,
      severity: 'recommended',
    })
  }

  // ── Quick-fix suggestions for failed checks ──
  const DOD_FIX_HINTS: Record<string, string> = {
    has_acceptance_criteria: 'Add acceptance criteria: use `agf node update <id> --ac "GIVEN x WHEN y THEN z"`',
    ac_quality_pass: 'Improve AC quality: use concrete Given-When-Then format with measurable outcomes',
    no_unresolved_blockers: 'Resolve blocker dependencies first with `agf node status <id> done`',
    status_flow_valid: 'Run `agf node status <id> in_progress` before marking done',
    has_description: 'Add a description: `agf node update <id> --description "..."`',
    not_oversized: 'Decompose large task into subtasks with `agf decompose`',
    has_testable_ac: 'Rewrite AC with concrete values: GIVEN/WHEN/THEN + numeric or boolean outcome',
    has_test_files: 'Create a test file and link it: `agf node update <id> --testFiles "src/tests/..."`',
    has_estimate: 'Set task size: add `**Tamanho:** S` (XS/S/M/L/XL) to description',
    has_citations_in_new_core_files: 'Add §EPIC or §ADR citation comment to new core/ files',
    complexity_budget_pass: 'Split complex files or reduce impl:test ratio to stay within budget',
    surgical_scope_pass: 'Avoid touching files outside declared scope; declare scope in task metadata',
    economy_awareness: 'Add economy flags: use `agf exec` with `--select` or `--compressed` flags',
    knowledge_store_entry: 'Index task context: run `agf code index` to populate the knowledge store',
  }
  const DOD_VIOLATION_MAP: Record<string, string> = {
    has_test_files: 'missing_test',
  }
  for (const check of checks) {
    if (!check.passed) {
      const violationType = DOD_VIOLATION_MAP[check.name]
      const rule = violationType ? findRule(violationType) : null
      check.fix = rule
        ? rule.fixTemplate
        : (DOD_FIX_HINTS[check.name] ?? 'Review the check details and fix the underlying issue')
    }
  }

  // ── Scoring ──
  const totalChecks = checks.length
  const passedChecks = checks.filter((c) => c.passed).length
  const score = Math.round((passedChecks / totalChecks) * 100)
  const grade = scoreToGrade(score)
  const ready = checks.filter((c) => c.severity === 'required').every((c) => c.passed)

  const summary = ready
    ? `DoD Ready (${grade}): ${passedChecks}/${totalChecks} checks passed, score ${score}`
    : `DoD Not Ready: ${checks
        .filter((c) => c.severity === 'required' && !c.passed)
        .map((c) => c.name)
        .join(', ')} failed`

  log.info('definition-of-done', { nodeId, ready, score, grade, passed: passedChecks, total: totalChecks })

  return { nodeId, title: node.title, checks, ready, score, grade, summary }
}
