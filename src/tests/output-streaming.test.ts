/*!
 * TDD: streaming render + spinner in OutputRenderer (node_3812316c864b).
 *
 * AC1: Given streamed response, partial chunks render progressively.
 * AC2: Given aborted run (signal), streaming stops cleanly with no dangling state.
 */

import { describe, it, expect } from 'vitest'
import { BRAILLE_SPINNER_FRAMES, getSpinnerFrame, StreamBuffer } from '../tui/components/output-streaming.js'

describe('AC: Braille spinner frames', () => {
  it('has at least 8 frames', () => {
    expect(BRAILLE_SPINNER_FRAMES.length).toBeGreaterThanOrEqual(8)
  })

  it('getSpinnerFrame cycles through frames by index', () => {
    const f0 = getSpinnerFrame(0)
    const fN = getSpinnerFrame(BRAILLE_SPINNER_FRAMES.length)
    expect(f0).toBe(fN) // wraps around
  })
})

describe('AC1: StreamBuffer accumulates chunks', () => {
  it('appends chunks progressively', () => {
    const buf = new StreamBuffer()
    buf.push('hello ')
    buf.push('world')
    expect(buf.value()).toBe('hello world')
    expect(buf.chunkCount()).toBe(2)
  })

  it('is empty on construction', () => {
    const buf = new StreamBuffer()
    expect(buf.value()).toBe('')
    expect(buf.chunkCount()).toBe(0)
  })
})

describe('AC2: StreamBuffer respects abort signal', () => {
  it('stops accepting chunks after abort', () => {
    const controller = new AbortController()
    const buf = new StreamBuffer(controller.signal)
    buf.push('before')
    controller.abort()
    buf.push('after') // should be ignored
    expect(buf.value()).toBe('before')
    expect(buf.aborted()).toBe(true)
  })

  it('isAborted() returns false before abort', () => {
    const controller = new AbortController()
    const buf = new StreamBuffer(controller.signal)
    expect(buf.aborted()).toBe(false)
  })
})
