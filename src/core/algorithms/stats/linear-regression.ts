export interface RegressionResult {
  slope: number
  intercept: number
  r2: number
}

export function linearRegression(points: number[][]): RegressionResult {
  const n = points.length
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0
  for (const [x, y] of points) {
    sumX += x!
    sumY += y!
    sumXY += x! * y!
    sumX2 += x! * x!
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  let ssRes = 0,
    ssTot = 0
  const meanY = sumY / n
  for (const [x, y] of points) {
    const pred = slope * x! + intercept
    ssRes += (y! - pred) ** 2
    ssTot += (y! - meanY) ** 2
  }
  const r2 = 1 - ssRes / ssTot
  return { slope, intercept, r2 }
}
