const path = require('node:path')

const ALLOWED_EXTS = new Set(['.jpg', '.png', '.pdf'])

function isAllowedExt(filename) {
  const ext = path.extname(filename).toLowerCase()
  return ALLOWED_EXTS.has(ext)
}

module.exports = { isAllowedExt }
