/**
 * Contains generic helper methods
 */

const config = require('config')
const ifxnjs = require('ifxnjs')
const _ = require('lodash')

const Pool = ifxnjs.Pool
const pool = Promise.promisifyAll(new Pool())
pool.setMaxPoolSize(config.get('INFORMIX.POOL_MAX_SIZE'))

const submissionApi = require('@topcoder-platform/topcoder-submission-api-wrapper')
const submissionApiClient = submissionApi(_.pick(config, [
  'AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'SUBMISSION_API_URL', 'AUTH0_PROXY_SERVER_URL']))

// Variable to cache reviewTypes from Submission API
const reviewTypes = {}

/**
 * Get Informix connection using the configured parameters
 * @return {Object} Informix connection
 */
async function getInformixConnection () {
  // construct the connection string from the configuration parameters.
  const connectionString = 'SERVER=' + config.get('INFORMIX.SERVER') +
                           ';DATABASE=' + config.get('INFORMIX.DATABASE') +
                           ';HOST=' + config.get('INFORMIX.HOST') +
                           ';Protocol=' + config.get('INFORMIX.PROTOCOL') +
                           ';SERVICE=' + config.get('INFORMIX.PORT') +
                           ';DB_LOCALE=' + config.get('INFORMIX.DB_LOCALE') +
                           ';UID=' + config.get('INFORMIX.USER') +
                           ';PWD=' + config.get('INFORMIX.PASSWORD')
  const conn = await pool.openAsync(connectionString)
  console.log(`Acquired the informix connection ${conn}`)
  return Promise.promisifyAll(conn)
}

/**
 * Get Kafka options
 * @return {Object} the Kafka options
 */
function getKafkaOptions () {
  const options = { connectionString: config.KAFKA_URL, groupId: config.KAFKA_GROUP_ID }
  if (config.KAFKA_CLIENT_CERT && config.KAFKA_CLIENT_CERT_KEY) {
    options.ssl = { cert: config.KAFKA_CLIENT_CERT, key: config.KAFKA_CLIENT_CERT_KEY }
  }
  return options
}

/*
 * Function to get reviewTypeId by Name
 * @param {String} reviewTypeName Name of the reviewType
 * @returns {String} reviewTypeId
 */
async function getReviewTypeId (reviewTypeName) {
  if (!reviewTypes[reviewTypeName]) {
    // Get review type id from Submission API
    const response = await submissionApiClient.searchReviewTypes({ name: reviewTypeName })
    if (response.body && response.body.length !== 0) {
      reviewTypes[reviewTypeName] = response.body[0].id
    } else {
      reviewTypes[reviewTypeName] = null
    }
  }
  return reviewTypes[reviewTypeName]
}

/**
 * Validate submission fields
 * @param {Object} submission The submission object for which to validate the fields.
 * @param {Array(String)} fields The array of fields to validate
 * @private
 */
function validateSubmissionFields (submission, fields) {
  for (const field of fields) {
    if (!submission[field]) {
      throw new Error(`${field} not found for submission: ${submission.id}`)
    }
  }
}

module.exports = {
  getKafkaOptions,
  getInformixConnection,
  getReviewTypeId,
  validateSubmissionFields
}
