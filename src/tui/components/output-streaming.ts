/*!
 * output-streaming — pure streaming primitives for OutputRenderer.
 *
 * WHY: incremental token rendering for responsive feel. Provides Braille spinner
 * frames and a StreamBuffer that accumulates chunks, respects an AbortSignal, and
 * tracks streaming state — zero side effects, fully testable without Ink.
 *
 * Composes with: OutputRenderer.tsx (consumer), theme-context.ts (color tokens).
 */

/** Braille spinner frames (claw-code pattern) — 8 frames, Unicode Braille dots. */
export const BRAILLE_SPINNER_FRAMES = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷']

/** Return the spinner frame at a given tick index (wraps). */
export function getSpinnerFrame(tick: number): string {
  return BRAILLE_SPINNER_FRAMES[tick % BRAILLE_SPINNER_FRAMES.length]!
}

/**
 * Accumulates streamed text chunks. Ignores pushes after an AbortSignal fires.
 * Immutable-style read API; mutations happen via push().
 */
export class StreamBuffer {
  private chunks: string[] = []
  private _aborted = false

  constructor(signal?: AbortSignal) {
    if (signal) {
      // Listen once; after abort, set flag and ignore further pushes
      signal.addEventListener(
        'abort',
        () => {
          this._aborted = true
        },
        { once: true },
      )
    }
  }

  push(chunk: string): void {
    if (this._aborted) return
    this.chunks.push(chunk)
  }

  value(): string {
    return this.chunks.join('')
  }

  chunkCount(): number {
    return this.chunks.length
  }

  aborted(): boolean {
    return this._aborted
  }
}
