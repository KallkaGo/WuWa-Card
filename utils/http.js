const axios = require('axios')

async function http(options) {
  const maxRetries = options.retries !== undefined ? options.retries : 1
  const timeout = options.timeout || 10000
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.request({
        timeout,
        ...options,
      })
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 400))
      }
    }
  }
  throw lastError
}

module.exports = http