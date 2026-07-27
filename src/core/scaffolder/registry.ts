/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Scaffold Registry — o "banco de combinações semânticas" do acoplador determinístico.
 *
 * Cataloga os scaffolders determinísticos (contract/interface/state-machine/
 * formula) numa interface uniforme `run(spec) → ScaffoldedFile[]`, cada um com
 * as `capabilities` que cobre (universo do set-cover na composição) e `keywords`
 * para o picker/RAG. Geração é 100% determinística — nenhum scaffolder chama LLM.
 */
import { scaffoldContract, type ContractSpec, type ScaffoldedFile } from './contract-scaffolder.js'
import { scaffoldInterface, type InterfaceSpec } from './interface-scaffolder.js'
import { scaffoldStateMachine, type StateMachineSpec } from './state-machine-scaffolder.js'
import { scaffoldFormula, type FormulaSpec } from './formula-scaffolder.js'

export type { ScaffoldedFile }

export type ScaffoldKind = 'contract' | 'interface' | 'state-machine' | 'formula'

/** Spec union — cada kind consome o seu próprio shape (validado pelo scaffolder). */
export type ScaffoldSpec = ContractSpec | InterfaceSpec | StateMachineSpec | FormulaSpec

/** Um item do plano de composição: qual scaffold aplicar com qual spec. */
export interface ScaffoldPlanItem {
  readonly kind: ScaffoldKind
  readonly spec: ScaffoldSpec
}

export interface ScaffoldEntry {
  readonly kind: ScaffoldKind
  readonly description: string
  /** Capacidades cobertas — universo do set-cover (CLRS §35.3). */
  readonly capabilities: readonly string[]
  /** Termos para match determinístico (picker) e indexação RAG. */
  readonly keywords: readonly string[]
}

export const SCAFFOLD_REGISTRY: readonly ScaffoldEntry[] = [
  {
    kind: 'contract',
    description: 'REST/MCP handler com validação de input/output (Zod) e guard-rails.',
    capabilities: ['rest-handler', 'mcp-handler', 'input-validation', 'output-validation'],
    keywords: ['contract', 'endpoint', 'handler', 'rest', 'mcp', 'api', 'request', 'response'],
  },
  {
    kind: 'interface',
    description: 'Interface TypeScript + stubs de teste (TDD red) preservando USER-CODE.',
    capabilities: ['typescript-interface', 'service-contract', 'tdd-stubs'],
    keywords: ['interface', 'service', 'contract', 'port', 'abstraction', 'methods'],
  },
  {
    kind: 'state-machine',
    description: 'Reducer exaustivo (estados×eventos) + matriz de testes de transição.',
    capabilities: ['state-reducer', 'exhaustive-switch', 'transition-tests'],
    keywords: ['state', 'machine', 'reducer', 'transition', 'lifecycle', 'fsm', 'status'],
  },
  {
    kind: 'formula',
    description: 'Função pura a partir de expressão + testes de propriedade (fast-check).',
    capabilities: ['pure-function', 'property-tests', 'math-domain'],
    keywords: ['formula', 'calculate', 'compute', 'expression', 'math', 'function'],
  },
]

/** Lookup de uma entry por kind. */
export function getScaffold(kind: string): ScaffoldEntry | undefined {
  return SCAFFOLD_REGISTRY.find((e) => e.kind === kind)
}

/** Lista todas as entries do registry. */
export function listScaffolds(): readonly ScaffoldEntry[] {
  return SCAFFOLD_REGISTRY
}

/**
 * Roda o scaffolder do kind e normaliza a saída para `ScaffoldedFile[]`. Puro,
 * determinístico, 0 LLM. Lança se o spec for inconsistente (ex.: formula com
 * variável fora do domínio) — o caller (compose) só passa specs válidos.
 */
export function runScaffold(kind: ScaffoldKind, spec: ScaffoldSpec): ScaffoldedFile[] {
  switch (kind) {
    case 'contract': {
      const r = scaffoldContract(spec as ContractSpec)
      return [r.handlerFile]
    }
    case 'interface': {
      const r = scaffoldInterface(spec as InterfaceSpec)
      return [r.interfaceFile, r.testFile]
    }
    case 'state-machine': {
      const r = scaffoldStateMachine(spec as StateMachineSpec)
      return [r.reducerFile, r.testFile]
    }
    case 'formula': {
      const r = scaffoldFormula(spec as FormulaSpec)
      return [r.functionFile, r.testFile]
    }
  }
}
