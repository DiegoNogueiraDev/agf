/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Silent-failure detector (node_5a3fb7203795, épico node_b94dd6f2df50).
 *
 * PORQUÊ: a classe DOMINANTE de defeito da validação de superfície (6 de 9 na sessão
 * real dos artigos okr-sbst) é a **falha silenciosa por contrato API↔tela divergente**:
 * a tela lê um shape/campo que o backend não entrega e degrada para VAZIO sem crashar —
 * o KR fica verde e a tela quebrada. Este detector estático acha os FALLBACKS MASCARANTES
 * que escondem essa divergência: `|| []`, `|| ''`, catch vazio, `@ts-expect-error`.
 *
 * Puro/determinístico: recebe o CONTEÚDO do arquivo (não lê disco — I/O fica no caller,
 * DIP). Espelha o padrão de src/core/analyzer/observability-checker.ts. Contract: C2
 * node_aa666f9ba2d1. Consumido pelo comando CLI de L5 (node_e7807a63a61d).
 */

/** Um fallback mascarante encontrado — arquivo:linha + o padrão + o trecho. */
export interface SilentFailureFinding {
  file: string
  /** 1-indexed. */
  line: number
  pattern: '|| []' | "|| ''" | 'empty_catch' | 'ts_expect_error'
  snippet: string
}

/** Regras linha-a-linha: cada padrão + o teste que o reconhece. `global` p/ múltiplos por linha. */
const LINE_RULES: ReadonlyArray<{ pattern: SilentFailureFinding['pattern']; test: RegExp }> = [
  { pattern: '|| []', test: /\|\|\s*\[\s*\]/ },
  { pattern: "|| ''", test: /\|\|\s*(''|"")/ },
  // catch vazio: `catch {}` (TS4+) ou `catch (e) {}` — braces vazias apenas (corpo real não casa).
  { pattern: 'empty_catch', test: /catch\s*(\([^)]*\)\s*)?\{\s*\}/ },
  { pattern: 'ts_expect_error', test: /@ts-expect-error/ },
]

/**
 * Varre `source` por fallbacks mascarantes e devolve um Finding por (linha, padrão).
 * Zero falso-positivo em código limpo. Não lê disco — `file` é só o rótulo do resultado.
 */
export function scanSilentFailures(source: string, file: string): SilentFailureFinding[] {
  const findings: SilentFailureFinding[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    for (const rule of LINE_RULES) {
      if (rule.test.test(raw)) {
        findings.push({ file, line: i + 1, pattern: rule.pattern, snippet: raw.trim() })
      }
    }
  }
  return findings
}

/** Um arquivo lido (path relativo + conteúdo) — a fronteira que o CLI de L5 injeta. */
export interface ScannedFile {
  path: string
  content: string
}

/** Envelope-payload do comando `agf scan-silent-failures` (node_e7807a63a61d). */
export interface SilentFailurePayload {
  ok: true
  findings: SilentFailureFinding[]
  checkedFiles: number
}

/**
 * Agrega os findings de vários arquivos num payload de CLI. Puro: o walker/leitor
 * de disco fica no comando (DIP) — aqui só recebe o conteúdo já lido.
 */
export function buildSilentFailurePayload(files: readonly ScannedFile[]): SilentFailurePayload {
  const findings = files.flatMap((f) => scanSilentFailures(f.content, f.path))
  return { ok: true, findings, checkedFiles: files.length }
}
