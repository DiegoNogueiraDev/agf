/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * OCR zero-config via `tesseract.js` (WASM puro, sem binário do sistema). É uma
 * dependência **OPCIONAL** — NÃO entra em `dependencies` (não infla o pacote);
 * quando presente (`npm i tesseract.js`), a leitura de imagem funciona sem
 * instalar nada além do npm. Espelha o padrão de dep opcional do ONNX/neural.
 * Ausente → `null`, e o chamador cai para o OCR de sistema ou visão gated.
 */
import { createRequire } from 'node:module'
import type { OcrStrategy } from './ocr.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'intake/ocr-wasm.ts' })

// Especificador não-literal: o módulo opcional não é resolvido em build/typecheck
// (evita TS2307 e bundle), apenas em runtime quando o usuário o instalou.
const TESSERACT_SPEC = ['tesseract', 'js'].join('.')

interface TesseractLike {
  recognize?: (image: string, lang?: string) => Promise<{ data?: { text?: string } }>
  default?: { recognize?: (image: string, lang?: string) => Promise<{ data?: { text?: string } }> }
}

/** True se `tesseract.js` está instalado (checagem síncrona, sem executar). */
export function hasWasmOcr(): boolean {
  try {
    createRequire(import.meta.url).resolve(TESSERACT_SPEC)
    return true
  } catch {
    return false
  }
}

let cached: OcrStrategy | null | undefined

/**
 * Resolve uma estratégia de OCR WASM, ou `null` se `tesseract.js` não está
 * instalado. Memoizado. Nunca lança no hot-path.
 */
export async function tryWasmOcr(): Promise<OcrStrategy | null> {
  if (cached !== undefined) return cached
  if (!hasWasmOcr()) {
    cached = null
    return null
  }
  try {
    const mod = (await import(TESSERACT_SPEC)) as TesseractLike
    const recognize = mod.recognize ?? mod.default?.recognize
    if (typeof recognize !== 'function') {
      cached = null
      return null
    }
    cached = async (imagePath: string): Promise<string | null> => {
      try {
        const res = await recognize(imagePath, 'eng')
        const text = res?.data?.text ?? ''
        return text.trim() ? text : null
      } catch (err) {
        log.warn('ocr:wasm-failed', { error: err instanceof Error ? err.message : String(err) })
        return null
      }
    }
    return cached
  } catch (err) {
    log.warn('ocr:wasm-load-failed', { error: err instanceof Error ? err.message : String(err) })
    cached = null
    return null
  }
}

/** Reseta o memo (apenas testes). */
export function _resetWasmOcrCache(): void {
  cached = undefined
}
