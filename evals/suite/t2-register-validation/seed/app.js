const { log } = require('./logger.js')

function register(email) {
  log('register ' + email)
  return { email }
}

module.exports = { register }
