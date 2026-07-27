import { z } from 'zod/v4'

export const RequestIdSchema = z.union([z.string(), z.number()])

export type RequestId = z.infer<typeof RequestIdSchema>

export const RequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: RequestIdSchema,
  method: z.string(),
  params: z.unknown().optional(),
})

export type Request = z.infer<typeof RequestSchema>

export const NotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.string(),
    params: z.unknown().optional(),
  })
  .strict()
  .refine((n) => !('id' in n), { message: 'Notification must not have id' })

export type Notification = z.infer<typeof NotificationSchema>

export const ResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: RequestIdSchema,
  result: z.unknown(),
})

export type Response = z.infer<typeof ResponseSchema>

export const JsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
})

export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>

export const ErrorSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: RequestIdSchema,
  error: JsonRpcErrorSchema,
})

export type ErrorMessage = z.infer<typeof ErrorSchema>

export const JSONRPCMessageSchema = z.union([RequestSchema, NotificationSchema, ResponseSchema, ErrorSchema])

export type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>
