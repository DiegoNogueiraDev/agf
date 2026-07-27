/** Type stub for optional dependency onnxruntime-node (ADR-05). */
declare module 'onnxruntime-node' {
  export class Tensor {
    constructor(type: string, data: BigInt64Array | Float32Array, dims: number[])
    readonly data: BigInt64Array | Float32Array
    readonly dims: number[]
    readonly type: string
  }

  export class InferenceSession {
    static create(path: string): Promise<InferenceSession>
    run(feeds: Record<string, Tensor>): Promise<Record<string, { data: Float32Array; dims: number[] }>>
    dispose(): void
  }
}
