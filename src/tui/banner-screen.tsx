/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * BannerScreen — green bug crawl animation rendered inside Ink's alternate
 * buffer. Calls `onDone` when the animation completes so the caller can
 * switch to the main dashboard.
 */
import { useState, useEffect, useCallback, type ReactElement } from 'react'
import { Box, Text } from 'ink'

const BUG_FRAMES = [' /\\(•‿•)/\\ ', '  \\(•‿•)/  ', ' /\\(•‿•)/\\ ']
const TAGLINE = 'mcp-graph-agent  —  Software Engineer as a Service'
const FRAME_MS = 28

export function BannerScreen({ onDone }: { onDone: () => void }): ReactElement {
  const cols = process.stdout.columns ?? 80
  const maxSteps = Math.max(cols - 14, 10)
  const [step, setStep] = useState(0)

  const done = useCallback(onDone, [onDone])

  useEffect(() => {
    if (step >= maxSteps) {
      const t = setTimeout(done, 300)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStep((s) => s + 1), FRAME_MS)
    return () => clearTimeout(t)
  }, [step, maxSteps, done])

  const bug = BUG_FRAMES[step % BUG_FRAMES.length]
  const trailLen = Math.min(step, maxSteps - 1)
  const trail = '·'.repeat(trailLen)
  const pad = ' '.repeat(step < maxSteps ? step : maxSteps)

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Text color="green">
        {pad}
        {trail}
        {bug}
      </Text>
      {step >= maxSteps && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">
            {TAGLINE}
          </Text>
          <Text dimColor>{'  type /help to see all commands'}</Text>
        </Box>
      )}
    </Box>
  )
}
