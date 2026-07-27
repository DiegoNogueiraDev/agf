/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Persistence for the Zipf-calibrated chars/token ratio (`zipf_estimate` lever).
 *
 * The fixed `chars/4` heuristic carries ~10–15% error; calibrating the ratio from
 * observed (chars, tokens) pairs — a property of the corpus vocabulary, per
 * Zipf-Mandelbrot — tightens budgets and cost projections without cutting content.
 * The calibrated ratio lives in a project setting; absent ⇒ the legacy default, so
 * budgets are byte-identical until calibration runs.
 */

import { calibrateCharsPerToken, DEFAULT_CHARS_PER_TOKEN, type TokenSample } from './zipf-estimator.js'

/** Project-setting key holding the calibrated chars/token ratio. */
export const ZIPF_CHARS_PER_TOKEN_KEY = 'zipf_chars_per_token'

/** Minimal read surface (the SqliteStore satisfies it). */
export interface ZipfCalibrationSource {
  getProjectSetting(key: string): string | null
}

/** Read+write surface (the SqliteStore satisfies it). */
export interface ZipfCalibrationStore extends ZipfCalibrationSource {
  setProjectSetting(key: string, value: string): void
}

/**
 * The project's calibrated chars/token ratio, or {@link DEFAULT_CHARS_PER_TOKEN}
 * when unset or invalid (⇒ legacy `chars/4` budgeting).
 */
export function getCalibratedCharsPerToken(source: ZipfCalibrationSource): number {
  const raw = source.getProjectSetting(ZIPF_CHARS_PER_TOKEN_KEY)
  if (!raw) return DEFAULT_CHARS_PER_TOKEN
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CHARS_PER_TOKEN
}

/**
 * Calibrate the chars/token ratio from observed samples (median of `chars/tokens`)
 * and persist it. Returns the stored ratio. No usable sample ⇒ the default, persisted.
 */
export function updateZipfCalibration(store: ZipfCalibrationStore, samples: TokenSample[]): number {
  const ratio = calibrateCharsPerToken(samples)
  store.setProjectSetting(ZIPF_CHARS_PER_TOKEN_KEY, String(ratio))
  return ratio
}
