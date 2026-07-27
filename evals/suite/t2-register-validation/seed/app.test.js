const test = require('node:test')
const assert = require('node:assert')
const { register } = require('./app.js')
const { isEmail } = require('./validate.js')

test('register valida e-mail', () => {
  assert.deepStrictEqual(register('a@b.co'), { email: 'a@b.co' })
  assert.throws(() => register('bad'))
})

test('isEmail', () => {
  assert.strictEqual(isEmail('x@y.com'), true)
  assert.strictEqual(isEmail('nope'), false)
})
