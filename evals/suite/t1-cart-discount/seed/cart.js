class Cart {
  constructor() {
    this.items = []
  }
  add(price) {
    this.items.push(price)
  }
  total() {
    return this.items.reduce((a, b) => a + b, 0)
  }
}

module.exports = { Cart }
