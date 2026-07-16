import { describe, it, expect } from 'vitest'
import {
  RequestSchema,
  ResponseSchema,
  ErrorSchema,
  NotificationSchema,
  JSONRPCMessageSchema,
} from '../schemas/jsonrpc.schema.js'

describe('RequestSchema', () => {
  it('accepts a valid request', () => {
    expect(
      RequestSchema.safeParse({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }).success,
    ).toBe(true)
  })

  it('accepts string id', () => {
    expect(
      RequestSchema.safeParse({
        jsonrpc: '2.0',
        id: 'req-abc',
        method: 'ping',
      }).success,
    ).toBe(true)
  })

  it('rejects wrong jsonrpc version', () => {
    expect(
      RequestSchema.safeParse({
        jsonrpc: '1.0',
        id: 1,
        method: 'ping',
      }).success,
    ).toBe(false)
  })
})

describe('ResponseSchema', () => {
  it('accepts a valid response', () => {
    expect(
      ResponseSchema.safeParse({
        jsonrpc: '2.0',
        id: 1,
        result: { tools: [] },
      }).success,
    ).toBe(true)
  })
})

describe('NotificationSchema', () => {
  it('accepts a valid notification', () => {
    expect(
      NotificationSchema.safeParse({
        jsonrpc: '2.0',
        method: 'progress',
      }).success,
    ).toBe(true)
  })
})

describe('ErrorSchema', () => {
  it('accepts a valid error response', () => {
    expect(
      ErrorSchema.safeParse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32600, message: 'Invalid Request' },
      }).success,
    ).toBe(true)
  })
})

describe('JSONRPCMessageSchema', () => {
  it('accepts a request as union member', () => {
    expect(
      JSONRPCMessageSchema.safeParse({
        jsonrpc: '2.0',
        id: 42,
        method: 'tools/call',
      }).success,
    ).toBe(true)
  })
})
