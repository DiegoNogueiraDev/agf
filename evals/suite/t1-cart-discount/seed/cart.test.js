const test = require('node:test')
const assert = require('node:assert')
const { Cart } = require('./cart.js')

test('discountedTotal aplica desconto', () => {
  const c = new Cart()
  c.add(100)
  c.add(100)
  assert.strictEqual(c.discountedTotal(10), 180)
  assert.strictEqual(c.discountedTotal(0), 200)
})

test('métodos existentes intactos', () => {
  const c = new Cart()
  c.add(50)
  assert.strictEqual(c.total(), 50)
})
