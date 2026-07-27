/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * OCR determinístico (0 token) — extrai texto de imagens SEM gastar modelo de
 * visão. Estratégia best-effort sobre binários do SISTEMA quando presentes
 * (zero-dep embarcada, local-first): `tesseract` (Tesseract OCR) ou um conversor
 * de documentos com OCR no PATH. Ausentes → retorna `null` e o chamador decide o
 * fallback (visão gated). Isolar os `execFile` aqui mantém `normalize-input` puro.
 */
import { execFileSync } from 'node:child_process'
import { hasWasmOcr } from './ocr-wasm.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'intake/ocr.ts' })

/** Estratégia de OCR: caminho da imagem → texto, ou `null` se indisponível. */
export type OcrStrategy = (imagePath: string) => Promise<string | null>

/** True se um binário existe no PATH (checagem barata, sem rede). */
function hasBinary(bin: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * OCR default: tenta `tesseract <img> stdout`, depois `markitdown <img>`. Qualquer
 * falha → `null` (nunca lança no hot-path; o chamador trata). Determinístico.
 */
export const defaultOcr: OcrStrategy = async (imagePath: string): Promise<string | null> => {
  if (hasBinary('tesseract')) {
    try {
      const out = execFileSync('tesseract', [imagePath, 'stdout'], { encoding: 'utf8', stdio: 'pipe', timeout: 60_000 })
      if (out.trim()) return out
    } catch (err) {
      log.warn('ocr:tesseract-failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  if (hasBinary('markitdown')) {
    try {
      const out = execFileSync('markitdown', [imagePath], { encoding: 'utf8', stdio: 'pipe', timeout: 60_000 })
      if (out.trim()) return out
    } catch (err) {
      log.warn('ocr:markitdown-failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  return null
}

/** True se há OCR local disponível: WASM (tesseract.js) ou binário do sistema. */
export function isOcrAvailable(): boolean {
  return hasWasmOcr() || hasBinary('tesseract') || hasBinary('markitdown')
}

/** Modo de OCR ativo, p/ doctor/status: 'wasm' | 'sistema' | 'indisponível'. */
export function ocrMode(): 'wasm' | 'sistema' | 'indisponível' {
  if (hasWasmOcr()) return 'wasm'
  if (hasBinary('tesseract') || hasBinary('markitdown')) return 'sistema'
  return 'indisponível'
}
