/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-html.ts' })

const HEADING_MAP: Record<string, string> = {
  h1: '#',
  h2: '##',
  h3: '###',
  h4: '####',
  h5: '#####',
  h6: '######',
}

/**
 * Extract text content from an HTML string using cheerio.
 * Converts headings to markdown format so the parser pipeline can segment them.
 * Strips tags, scripts, styles, and normalizes whitespace.
 */
export async function readHtmlContent(html: string): Promise<string> {
  // Dynamic import — cheerio is heavy, lazy-load
  const { load } = await import('cheerio')

  log.info('Parsing HTML content', { sizeChars: html.length })

  const $Var = load(html)

  // Remove non-content elements
  $Var('script, style, nav, footer, header, noscript, iframe').remove()

  // Convert HTML headings to markdown headings
  for (const [tag, prefix] of Object.entries(HEADING_MAP)) {
    $Var(tag).each(function (this: unknown) {
      const el = $Var(this as string)
      const text = el.text().trim()
      el.replaceWith(`\n\n${prefix} ${text}\n\n`)
    })
  }

  // Convert list items to markdown bullets
  $Var('li').each(function (this: unknown) {
    const el = $Var(this as string)
    const text = el.text().trim()
    el.replaceWith(`\n- ${text}`)
  })

  // Add line breaks for block elements
  const blockElements = 'p, div, section, article, blockquote, pre, br, tr'
  $Var(blockElements).each(function (this: unknown) {
    $Var(this as string).prepend('\n')
    $Var(this as string).append('\n')
  })

  // Extract text from body (or whole doc if no body)
  const rawText = $Var('body').length ? $Var('body').text() : $Var.root().text()

  const text = rawText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  log.info('HTML parsed', { textLength: text.length })

  return text
}
