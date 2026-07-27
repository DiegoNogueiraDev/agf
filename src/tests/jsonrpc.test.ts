import { describe, it, expect } from 'vitest'
import {
  RequestIdSchema,
  RequestSchema,
  NotificationSchema,
  ResponseSchema,
  ErrorSchema,
  JSONRPCMessageSchema,
} from '../schemas/jsonrpc.schema.js'

describe('RequestIdSchema', () => {
  it('aceita string como RequestId', () => {
    expect(RequestIdSchema.parse('abc-123')).toBe('abc-123')
  })

  it('aceita number como RequestId', () => {
    expect(RequestIdSchema.parse(42)).toBe(42)
  })

  it('rejeita boolean como RequestId', () => {
    expect(() => RequestIdSchema.parse(true)).toThrow()
  })
})

describe('RequestSchema', () => {
  it('parse com campos minimos (id + method)', () => {
    const req = RequestSchema.parse({ jsonrpc: '2.0', id: '1', method: 'ping' })
    expect(req.id).toBe('1')
    expect(req.method).toBe('ping')
    expect(req.params).toBeUndefined()
  })

  it('parse com params', () => {
    const req = RequestSchema.parse({ jsonrpc: '2.0', id: 1, method: 'add', params: [1, 2] })
    expect(req.params).toEqual([1, 2])
  })

  it('rejeita request sem id', () => {
    expect(() => RequestSchema.parse({ jsonrpc: '2.0', method: 'ping' })).toThrow()
  })
})

describe('NotificationSchema', () => {
  it('parse com method', () => {
    const n = NotificationSchema.parse({ jsonrpc: '2.0', method: 'updated' })
    expect(n.method).toBe('updated')
  })

  it('rejeita notification com id', () => {
    expect(() => NotificationSchema.parse({ jsonrpc: '2.0', id: '1', method: 'x' })).toThrow()
  })
})

describe('ResponseSchema', () => {
  it('parse com id + result', () => {
    const res = ResponseSchema.parse({ jsonrpc: '2.0', id: '1', result: 'ok' })
    expect(res.id).toBe('1')
    expect(res.result).toBe('ok')
  })

  it('rejeita response sem result', () => {
    expect(() => ResponseSchema.parse({ jsonrpc: '2.0', id: '1' })).toThrow()
  })
})

describe('ErrorSchema', () => {
  it('parse com code + message', () => {
    const err = ErrorSchema.parse({ jsonrpc: '2.0', id: '1', error: { code: -32601, message: 'Method not found' } })
    expect(err.id).toBe('1')
    expect(err.error.code).toBe(-32601)
    expect(err.error.message).toBe('Method not found')
  })

  it('parse com error.data opcional', () => {
    const err = ErrorSchema.parse({
      jsonrpc: '2.0',
      id: '1',
      error: { code: -32603, message: 'Internal error', data: { detail: 'Oops' } },
    })
    expect(err.error.data).toEqual({ detail: 'Oops' })
  })
})

describe('JSONRPCMessageSchema', () => {
  it('discrimina Request por presenca de id e method e ausencia de error', () => {
    const msg = JSONRPCMessageSchema.parse({ jsonrpc: '2.0', id: '1', method: 'ping' })
    expect(msg.id).toBe('1')
    expect(msg.method).toBe('ping')
  })

  it('discrimina Notification por ausencia de id e presenca de method', () => {
    const msg = JSONRPCMessageSchema.parse({ jsonrpc: '2.0', method: 'event' })
    expect(msg.method).toBe('event')
  })

  it('discrimina Response por id + result', () => {
    const msg = JSONRPCMessageSchema.parse({ jsonrpc: '2.0', id: '1', method: 'ping' })
    expect(msg).toHaveProperty('id')
  })

  it('discrimina Error por error.code', () => {
    const msg = JSONRPCMessageSchema.parse({ jsonrpc: '2.0', id: '1', error: { code: -32601, message: 'Not found' } })
    expect(msg).toHaveProperty('error')
  })

  it('roundtrip serialize/deserialize', () => {
    const req = { jsonrpc: '2.0', id: 'abc', method: 'test', params: { x: 1 } }
    const parsed = JSONRPCMessageSchema.parse(JSON.parse(JSON.stringify(req)))
    expect(parsed.id).toBe('abc')
    expect(parsed.method).toBe('test')
  })
})
