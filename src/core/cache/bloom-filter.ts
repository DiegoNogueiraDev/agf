export class BloomFilter {
  private readonly bits: Uint8Array
  private readonly numHashes: number
  private readonly size: number
  private count = 0

  constructor(expectedItems: number, falsePositiveRate: number) {
    this.size = Math.max(64, Math.ceil(-(expectedItems * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2)))
    this.numHashes = Math.max(1, Math.ceil((this.size / expectedItems) * Math.LN2))
    this.bits = new Uint8Array(Math.ceil(this.size / 8))
  }

  add(key: string): void {
    const [h1, h2] = this.hashPair(key)
    for (let i = 0; i < this.numHashes; i++) {
      const idx = (h1 + i * h2 + i * i) % this.size
      const byteIdx = Math.floor(idx / 8)
      const bitIdx = idx % 8
      this.bits[byteIdx] |= 1 << bitIdx
    }
    this.count++
  }

  mightContain(key: string): boolean {
    const [h1, h2] = this.hashPair(key)
    for (let i = 0; i < this.numHashes; i++) {
      const idx = (h1 + i * h2 + i * i) % this.size
      const byteIdx = Math.floor(idx / 8)
      const bitIdx = idx % 8
      if (!(this.bits[byteIdx] & (1 << bitIdx))) {
        return false
      }
    }
    return true
  }

  clear(): void {
    this.bits.fill(0)
    this.count = 0
  }

  approximateCount(): number {
    return this.count
  }

  private hashPair(key: string): [number, number] {
    let h1 = 0x811c9dc5
    let h2 = 0xcbf29ce4
    for (let i = 0; i < key.length; i++) {
      const c = key.charCodeAt(i)
      h1 ^= c
      h1 = Math.imul(h1, 0x01000193)
      h2 ^= c
      h2 = Math.imul(h2, 0x01000193) ^ i
    }
    return [h1 >>> 0, h2 >>> 0]
  }
}
