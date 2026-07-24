/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_72a9987e8fa5 — Cobertura de logging: proporção de módulos que de fato
 * instrumentam logs (createLogger ou chamadas log./logger.). Pura — o comando
 * `quality` a usa para o gate 95/95. Arquivos de teste são ignorados.
 */

export interface SourceFile {
  path: string
  content: string
}

export interface LoggingCoverageResult {
  logScore: number
  total: number
  logged: number
  /** Módulos sem nenhuma instrumentação de log. */
  dark: string[]
}

/** Detecta instrumentação de log num arquivo (createLogger / log. / logger.). */
const LOG_RE = /\bcreateLogger\b|\blog\.(info|warn|error|debug|trace)\b|\blogger\.(info|warn|error|debug|trace)\b/

function isTestFile(path: string): boolean {
  return /\.(test|spec|bench)\.[tj]sx?$/.test(path)
}

/** Pontua a cobertura de logging dos arquivos de código (ignora testes). */
export function scoreLoggingCoverage(files: SourceFile[]): LoggingCoverageResult {
  const modules = files.filter((f) => !isTestFile(f.path))
  if (modules.length === 0) {
    return { logScore: 100, total: 0, logged: 0, dark: [] }
  }
  const dark: string[] = []
  let logged = 0
  for (const file of modules) {
    if (LOG_RE.test(file.content)) logged += 1
    else dark.push(file.path)
  }
  return {
    logScore: Math.round((logged / modules.length) * 100),
    total: modules.length,
    logged,
    dark,
  }
}
