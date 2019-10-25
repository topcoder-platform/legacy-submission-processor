/**
 * Contains generic helper methods
 */

const helper = require('../../src/common/helper')

/**
 * Clear submission data
 */
async function clearSubmissions () {
  const connection = await helper.getInformixConnection()
  try {
    await connection.queryAsync('DELETE FROM resource_submission')
    await connection.queryAsync('DELETE FROM submission')
    await connection.queryAsync('DELETE FROM upload')
  } finally {
    await connection.closeAsync()
  }
}

module.exports = {
  clearSubmissions
}
