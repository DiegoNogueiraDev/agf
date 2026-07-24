/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Delivery Certainty — the single "está REALMENTE pronto?" verdict
 * (node_19809e400130, épico node_7deb314e81b0; contract node_dca03c59b78c).
 *
 * PORQUÊ: os sinais de honestidade do agf (triangulação código+teste no disco,
 * consumer-proof, blockers, DoD, FPY, harness) existiam ESPALHADOS e advisory.
 * Este composer PURO os funde em UM veredito com banda + confidence e os MEIOS
 * (pilares) renderizados — cada pilar traz `source` (de onde veio) e `rationale`
 * (por que torna o done confiável), para o `--explain` não inventar nada.
 *
 * Modelo não-Goodhartável: pilares HARD (code_on_disk ∧ test_on_disk ∧
 * consumer_proof ∧ no_blockers) — qualquer vermelho ⇒ banda PROVEN_INCOMPLETE,
 * nunca "certo". Pilares SOFT (dod_ready, first_pass, harness) modulam a %.
 * 99.9% = probabilidade de falso-done dado TODOS os hard verdes (conjunção de
 * checks independentes). I/O é injetado (DIP): fileExists + os soft via ports,
 * então o core é testável com :memory: + stub. Reúsa missingFiles
 * (src/core/gaps/detect-phantom-done.ts) e findTransitiveBlockers
 * (src/core/planner/dependency-chain.ts) — não recria.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { missingFiles, type FileExistsPort } from '../gaps/detect-phantom-done.js'
import { findTransitiveBlockers } from '../planner/dependency-chain.js'

/** Um pilar de certeza: o meio, seu estado, de onde veio e por que importa. */
export interface CertaintyPillar {
  key: 'code_on_disk' | 'test_on_disk' | 'consumer_proof' | 'no_blockers' | 'dod_ready' | 'first_pass' | 'harness'
  kind: 'hard' | 'soft'
  state: 'green' | 'red' | 'na'
  /** De onde o veredito deste pilar veio (arquivo faltante, contagem de blockers, etc.). */
  source: string
  /** O que foi observado. */
  detail: string
  /** POR QUE este pilar torna o done confiável (consumido por --explain). */
  rationale: string
}

/** Veredito agregado — o payload de `agf certainty <id>`. */
export interface DeliveryCertainty {
  nodeId: string
  /** 0–100. 0 quando UNKNOWN. */
  confidence: number
  band: 'PROVEN' | 'PROVEN_INCOMPLETE' | 'UNKNOWN'
  pillars: CertaintyPillar[]
  /** Keys dos pilares HARD vermelhos que impedem PROVEN. */
  blockingPillars: string[]
}

/** Sinais injetados. Hard via doc+fileExists; soft opcionais (na quando ausentes). */
export interface CertaintyPorts {
  fileExists: FileExistsPort
  /** DoD ready (checkDefinitionOfDone) — soft. */
  dodReady?: boolean
  /** First-Pass Yield ∈ [0,1] ou null — soft. */
  firstPass?: number | null
  /** Grade do harness (A–D) — soft. */
  harnessGrade?: string | null
  /** Último episodic outcome do node — endurece test_on_disk (existir ≠ passar). */
  lastOutcome?: 'success' | 'failure' | 'partial' | null
}

/** Metadados estáticos de um pilar — o que mede, de onde lê, por que importa. */
export interface PillarMeta {
  kind: CertaintyPillar['kind']
  /** O QUE este pilar mede. */
  measures: string
  /** QUAL a fonte (módulo/tabela) de onde o estado é lido. */
  source: string
  /** POR QUE torna o done confiável. */
  rationale: string
}

/**
 * FONTE ÚNICA dos pilares (DRY): o composer constrói os pilares a partir daqui
 * e `agf certainty --explain` (src/core/certainty/explain-certainty.ts) explica
 * os MEIOS a partir do MESMO catálogo — a explicação não pode divergir do que
 * o veredito realmente usa.
 */
export const PILLAR_META: Record<CertaintyPillar['key'], PillarMeta> = {
  code_on_disk: {
    kind: 'hard',
    measures: 'Se todo arquivo de implementationFiles existe no disco.',
    source: 'node.implementationFiles × filesystem (missingFiles)',
    rationale:
      'O código declarado existe no disco — sem arquivo físico, o done é alucinação (triangulação AC↔código↔teste).',
  },
  test_on_disk: {
    kind: 'hard',
    measures: 'Se todo testFile existe no disco E o último outcome não foi falha.',
    source: 'node.testFiles × filesystem + último episodic outcome',
    rationale: 'O teste declarado existe E passou — existência sozinha não prova comportamento.',
  },
  consumer_proof: {
    kind: 'hard',
    measures: 'Se há prova registrada de execução no modo do consumidor (comando + resultado).',
    source: 'node.metadata.consumerProof (agf submit --consumer-proof)',
    rationale: 'Há prova de execução no modo do consumidor real (comando + evidência), não só unit isolado.',
  },
  no_blockers: {
    kind: 'hard',
    measures: 'Se existe alguma dependência depends_on ainda não concluída.',
    source: 'findTransitiveBlockers sobre o grafo',
    rationale: 'Nenhuma dependência não-resolvida — um blocker aberto significa que a entrega não fecha o fluxo.',
  },
  dod_ready: {
    kind: 'soft',
    measures: 'Se a Definition of Done do node está pronta.',
    source: 'checkDefinitionOfDone',
    rationale: 'A Definition of Done passou — AC, testável, sem violação de fluxo.',
  },
  first_pass: {
    kind: 'soft',
    measures: 'Se a entrega foi aceita de primeira (sem retrabalho).',
    source: 'computeFirstPassYield (episodic outcomes)',
    rationale: 'Entregue de primeira (Six Sigma FPY) — sem retrabalho, sinal de assertividade.',
  },
  harness: {
    kind: 'soft',
    measures: 'O grau de qualidade do harness (tipos/testes/erros).',
    source: 'agf harness',
    rationale: 'Qualidade do harness (tipos/testes/erros) em grau aceitável.',
  },
}

/** Ordem canônica dos pilares — usada pelo composer e pelo --explain. */
export const PILLAR_KEYS = Object.keys(PILLAR_META) as CertaintyPillar['key'][]

function pillar(
  key: CertaintyPillar['key'],
  kind: CertaintyPillar['kind'],
  state: CertaintyPillar['state'],
  source: string,
  detail: string,
): CertaintyPillar {
  return { key, kind, state, source, detail, rationale: PILLAR_META[key].rationale }
}

function unknown(nodeId: string, pillars: CertaintyPillar[]): DeliveryCertainty {
  return { nodeId, confidence: 0, band: 'UNKNOWN', pillars, blockingPillars: [] }
}

/**
 * Funde os sinais num veredito de certeza de entrega. Puro: todo I/O vem via
 * `ports`. Um node que declara NEM implementationFiles NEM testFiles não pode
 * ser provado ⇒ UNKNOWN/confidence 0 (nunca PROVEN por ausência de dados).
 */
export function computeDeliveryCertainty(doc: GraphDocument, nodeId: string, ports: CertaintyPorts): DeliveryCertainty {
  const node = doc.nodes.find((n) => n.id === nodeId)
  const implFiles = node?.implementationFiles ?? []
  const testFiles = node?.testFiles ?? []

  const code = buildCodePillar(implFiles, ports.fileExists)
  const test = buildTestPillar(testFiles, ports.fileExists, ports.lastOutcome)
  const proof = buildProofPillar(node?.metadata?.consumerProof)
  const blockers = buildBlockerPillar(doc, nodeId)
  const dod = buildSoftPillar('dod_ready', ports.dodReady, 'checkDefinitionOfDone', 'DoD ready')
  const fpy = buildFpyPillar(ports.firstPass)
  const harness = buildHarnessPillar(ports.harnessGrade)

  const pillars = [code, test, proof, blockers, dod, fpy, harness]

  // No physical files declared → nothing is provable.
  if (implFiles.length === 0 && testFiles.length === 0) {
    return unknown(nodeId, pillars)
  }

  const hard = pillars.filter((p) => p.kind === 'hard')
  const blockingPillars = hard.filter((p) => p.state === 'red').map((p) => p.key)

  if (blockingPillars.length > 0) {
    const measuredHard = hard.filter((p) => p.state !== 'na')
    const greenHard = measuredHard.filter((p) => p.state === 'green').length
    const confidence = measuredHard.length === 0 ? 0 : Math.round((50 * greenHard) / measuredHard.length)
    return { nodeId, confidence, band: 'PROVEN_INCOMPLETE', pillars, blockingPillars }
  }

  // All hard pillars green → PROVEN; soft pillars lift confidence from 95→100.
  const soft = pillars.filter((p) => p.kind === 'soft' && p.state !== 'na')
  const greenSoft = soft.filter((p) => p.state === 'green').length
  const confidence = soft.length === 0 ? 95 : 95 + Math.round((5 * greenSoft) / soft.length)
  return { nodeId, confidence, band: 'PROVEN', pillars, blockingPillars: [] }
}

function buildCodePillar(implFiles: readonly string[], fileExists: FileExistsPort): CertaintyPillar {
  if (implFiles.length === 0) {
    return pillar(
      'code_on_disk',
      'hard',
      'na',
      'implementationFiles: (none declared)',
      'Nenhum arquivo de código declarado',
    )
  }
  const missing = missingFiles(implFiles, fileExists)
  return missing.length === 0
    ? pillar('code_on_disk', 'hard', 'green', implFiles.join(', '), `${implFiles.length} arquivo(s) no disco`)
    : pillar('code_on_disk', 'hard', 'red', missing.join(', '), `arquivo(s) ausente(s): ${missing.join(', ')}`)
}

function buildTestPillar(
  testFiles: readonly string[],
  fileExists: FileExistsPort,
  lastOutcome: CertaintyPorts['lastOutcome'],
): CertaintyPillar {
  if (testFiles.length === 0) {
    return pillar('test_on_disk', 'hard', 'na', 'testFiles: (none declared)', 'Nenhum teste declarado')
  }
  const missing = missingFiles(testFiles, fileExists)
  if (missing.length > 0) {
    return pillar('test_on_disk', 'hard', 'red', missing.join(', '), `teste(s) ausente(s): ${missing.join(', ')}`)
  }
  // Existence ≠ passing: a recorded FAILURE keeps it red even with the files present.
  if (lastOutcome === 'failure' || lastOutcome === 'partial') {
    return pillar(
      'test_on_disk',
      'hard',
      'red',
      `lastOutcome=${lastOutcome}`,
      'arquivos existem mas último outcome não foi success',
    )
  }
  return pillar('test_on_disk', 'hard', 'green', testFiles.join(', '), `${testFiles.length} teste(s) no disco`)
}

function buildProofPillar(raw: unknown): CertaintyPillar {
  const proof = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  const command = proof && typeof proof.command === 'string' ? proof.command : ''
  const result = proof && typeof proof.result === 'string' ? proof.result : undefined
  // Green when a command was recorded AND (no result field, or it passed) — a
  // failed/forged proof does not count (risk node_75b021dbd53c).
  const green = command.length > 0 && (result === undefined || result === 'passed')
  return green
    ? pillar('consumer_proof', 'hard', 'green', 'node.metadata.consumerProof', `command="${command}"`)
    : pillar(
        'consumer_proof',
        'hard',
        'red',
        'node.metadata.consumerProof',
        result ? `proof result=${result}` : 'sem consumer-proof registrado',
      )
}

function buildBlockerPillar(doc: GraphDocument, nodeId: string): CertaintyPillar {
  const unresolved = findTransitiveBlockers(doc, nodeId).filter((b) => b.status !== 'done')
  return unresolved.length === 0
    ? pillar('no_blockers', 'hard', 'green', 'findTransitiveBlockers', 'sem blockers não-resolvidos')
    : pillar(
        'no_blockers',
        'hard',
        'red',
        unresolved.map((b) => b.id).join(', '),
        `${unresolved.length} blocker(s) pendente(s)`,
      )
}

function buildSoftPillar(
  key: CertaintyPillar['key'],
  ready: boolean | undefined,
  source: string,
  label: string,
): CertaintyPillar {
  if (ready === undefined) return pillar(key, 'soft', 'na', source, 'não medido nesta superfície')
  return pillar(key, 'soft', ready ? 'green' : 'red', source, `${label}: ${ready}`)
}

function buildFpyPillar(firstPass: number | null | undefined): CertaintyPillar {
  if (firstPass === undefined || firstPass === null) {
    return pillar('first_pass', 'soft', 'na', 'computeFirstPassYield', 'sem histórico de entrega')
  }
  return firstPass >= 1
    ? pillar('first_pass', 'soft', 'green', 'computeFirstPassYield', `FPY=${firstPass}`)
    : pillar('first_pass', 'soft', 'red', 'computeFirstPassYield', `FPY=${firstPass} (houve retrabalho)`)
}

function buildHarnessPillar(grade: string | null | undefined): CertaintyPillar {
  if (grade === undefined || grade === null) {
    return pillar('harness', 'soft', 'na', 'agf harness', 'não medido nesta superfície')
  }
  return grade === 'A' || grade === 'B'
    ? pillar('harness', 'soft', 'green', 'agf harness', `grade ${grade}`)
    : pillar('harness', 'soft', 'red', 'agf harness', `grade ${grade}`)
}
