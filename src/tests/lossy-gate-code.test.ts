/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { createCodeVerify } from '../core/economy/lossy-gate.js'

describe('createCodeVerify (AST-based)', () => {
  it('preserves top-level functions', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export function foo() { return 1 }\nexport function bar() { return 2 }',
      'export function foo() { return 99 }\nexport function bar() { return 2 }',
    )
    expect(result).toBe(true)
  })

  it('reverts when a top-level function is removed', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export function foo() { return 1 }\nexport function bar() { return 2 }',
      'export function foo() { return 1 }',
    )
    expect(result).toBe(false)
  })

  it('preserves exported const declarations', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export const FOO = "hello"\nexport const BAR = "world"',
      'export const FOO = "hi"\nexport const BAR = "there"',
    )
    expect(result).toBe(true)
  })

  it('reverts when exported const is removed', async () => {
    const verify = createCodeVerify()
    const result = await verify('export const FOO = 1\nexport const BAR = 2', 'export const BAR = 2')
    expect(result).toBe(false)
  })

  it('preserves classes', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export class MyService { doSomething() {} }\nexport function helper() {}',
      'export class MyService { doSomethingElse() {} }\nexport function helper() {}',
    )
    expect(result).toBe(true)
  })

  it('reverts when class is removed', async () => {
    const verify = createCodeVerify()
    const result = await verify('export class A {}\nexport class B {}', 'export class A {}')
    expect(result).toBe(false)
  })

  it('reverts when interface is removed', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export interface Props { name: string }\nexport interface State { count: number }',
      'export interface Props { name: string }',
    )
    expect(result).toBe(false)
  })

  it('returns true for identical code', async () => {
    const verify = createCodeVerify()
    const result = await verify('export function x() {}\nconst y = 1', 'export function x() {}\nconst y = 1')
    expect(result).toBe(true)
  })

  it('returns true when no top-level exports (lenient)', async () => {
    const verify = createCodeVerify()
    const result = await verify('console.log("hello")', 'console.log("hi")')
    expect(result).toBe(true)
  })

  it('handles async functions', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export async function fetchData() { return 1 }',
      'export async function fetchData() { return 2 }',
    )
    expect(result).toBe(true)
  })

  it('reverts when candidate has parse errors', async () => {
    const verify = createCodeVerify()
    const result = await verify('export function foo() { return 1 }', 'export function foo() { return 1 ')
    expect(result).toBe(false)
  })

  it('preserves exported type alias', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export type UserId = string\nexport function lookup(id: string) {}',
      'export type UserId = number\nexport function lookup(id: string) {}',
    )
    expect(result).toBe(true)
  })

  it('preserves exported enum', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export enum Color { Red, Green, Blue }',
      'export enum Color { Red = 1, Green = 2, Blue = 3 }',
    )
    expect(result).toBe(true)
  })

  it('reverts when enum is dropped', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export enum Color { Red, Green, Blue }\nexport const SIZE = 1',
      'export const SIZE = 1',
    )
    expect(result).toBe(false)
  })

  it('handles export let and var', async () => {
    const verify = createCodeVerify()
    const result = await verify(
      'export let count = 0\nexport var name = "x"',
      'export let count = 1\nexport var name = "y"',
    )
    expect(result).toBe(true)
  })
})
