import { writeFileSync, renameSync, mkdirSync, openSync, fsyncSync, closeSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Write `data` as JSON to `filePath` atomically: write to a temp file, fsync, then rename — prevents half-written files on crash. */
export function atomicJsonWrite(filePath: string, data: unknown): void {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })

  const tmp = `${filePath}.${randomUUID()}.tmp`
  const json = JSON.stringify(data, null, 2)

  writeFileSync(tmp, json, 'utf8')
  try {
    const fd = openSync(tmp, 'r')
    fsyncSync(fd)
    closeSync(fd)
  } catch {
    /* non-fatal if fsync unavailable */
  }
  renameSync(tmp, filePath)
}
