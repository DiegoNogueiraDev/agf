import { describe, it, expect } from 'vitest'
import { encodeFrame, FrameBuffer } from '../core/daemon/daemon-protocol.js'

describe('encodeFrame', () => {
  it('returns JSON string ending with newline', () => {
    const result = encodeFrame({ type: 'ping' })
    expect(result.endsWith('\n')).toBe(true)
  })

  it('serializes message as JSON', () => {
    const msg = { type: 'ping', id: '123' }
    const result = encodeFrame(msg)
    expect(JSON.parse(result.trim())).toEqual(msg)
  })

  it('handles null', () => {
    const result = encodeFrame(null)
    expect(result.trim()).toBe('null')
  })
})

describe('FrameBuffer', () => {
  it('can be instantiated', () => {
    expect(() => new FrameBuffer()).not.toThrow()
  })

  it('feed() returns parsed frames', () => {
    const buf = new FrameBuffer()
    const frames = buf.feed(encodeFrame({ type: 'test' }))
    expect(frames.length).toBe(1)
    expect((frames[0] as { type: string }).type).toBe('test')
  })

  it('handles chunked input by accumulating', () => {
    const buf = new FrameBuffer()
    const encoded = encodeFrame({ x: 1 })
    const partial = buf.feed(encoded.slice(0, 3))
    expect(partial.length).toBe(0)
    const full = buf.feed(encoded.slice(3))
    expect(full.length).toBe(1)
  })

  it('pending() shows buffered data', () => {
    const buf = new FrameBuffer()
    buf.feed('{"incomplete"')
    expect(buf.pending().length).toBeGreaterThan(0)
  })

  it('reset() clears buffer', () => {
    const buf = new FrameBuffer()
    buf.feed('{"incomplete"')
    buf.reset()
    expect(buf.pending()).toBe('')
  })
})
