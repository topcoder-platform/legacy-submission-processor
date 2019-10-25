/**
 * Processor Service
 */

const _ = require('lodash')
const Joi = require('@hapi/joi')
const config = require('config')
const momentTZ = require('moment-timezone')
const submissionApi = require('@topcoder-platform/topcoder-submission-api-wrapper')
const logger = require('../common/logger')
const helper = require('../common/helper')
const IDGenerator = require('../common/IdGenerator')
const constants = require('../constants')

const idUploadGen = new IDGenerator(config.ID_SEQ_UPLOAD)
const idSubmissionGen = new IDGenerator(config.ID_SEQ_SUBMISSION)

const submissionApiClient = submissionApi(_.pick(config, [
  'AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'SUBMISSION_API_URL', 'AUTH0_PROXY_SERVER_URL']))

const timeZone = 'America/New_York'

/**
 * Prepare Informix statement
 * @param {Object} connection the Informix connection
 * @param {String} sql the sql
 * @return {Object} Informix statement
 */
async function prepare (connection, sql) {
  const stmt = await connection.prepareAsync(sql)
  return Promise.promisifyAll(stmt)
}

/**
 * Get resourceId, phaseTypeId for a given user, challenge id, resource role id and phase id
 *
 * @param {Object} connection the Informix connection
 * @param {Number} challengeId challenge id
 * @param {Number} userId user id
 * @param {Number} resourceRoleId resource role id
 * @param {Number} phaseId submission phasse id
 * @returns {Object} challenge properties (resourceId, phaseTypeId)
 */
async function getChallengeProperties (connection, challengeId, userId, resourceRoleId, phaseId) {
  // The query to get challenge properties
  const query = `select r.resource_id, pi28.value, pp.phase_type_id, pcl.project_type_id
    from project p, project_category_lu pcl, resource r, project_phase pp, outer project_info pi28
    where p.project_category_id = pcl.project_category_id and p.project_id = r.project_id
    and r.user_id = ${userId} and r.resource_role_id = ${resourceRoleId} and p.project_id = pp.project_id
    and pp.project_phase_id = ${phaseId} and p.project_id = pi28.project_id
    and pi28.project_info_type_id = 28 and p.project_id = ${challengeId}`
  const result = await connection.queryAsync(query)
  if (result.length === 0) {
    throw new Error(`Empty result get challenge properties for: challengeId ${challengeId}, userId ${userId}, resourceRoleId ${resourceRoleId}, phaseId ${phaseId}`)
  }
  return {
    resourceId: Number(result[0].resource_id),
    phaseTypeId: Number(result[0].phase_type_id)
  }
}

/**
 * Insert a record in specified table
 * @param {Object} connection the Informix connection
 * @param {String} tableName the table name
 * @param {Object} columnValues the column key-value map
 */
async function insertRecord (connection, tableName, columnValues) {
  const normalizedColumnValues = _.omitBy(columnValues, _.isNil)
  const keys = Object.keys(normalizedColumnValues)
  const values = _.fill(Array(keys.length), '?')

  const insertRecordStmt = await prepare(connection, `insert into ${tableName} (${keys.join(', ')}) values (${values.join(', ')})`)

  await insertRecordStmt.executeAsync(Object.values(normalizedColumnValues))
}

/**
 * Create challenge submission
 * @param {Object} connection the Informix connection
 * @param {Object} payload the message payload
 */
async function createChallengeSubmission (connection, payload) {
  const {
    resourceId,
    phaseTypeId
  } = await getChallengeProperties(connection, payload.challengeId, payload.memberId, constants.submissionTypes[payload.type].roleId, payload.submissionPhaseId)

  logger.debug('Getting uploadId')
  const uploadId = await idUploadGen.getNextId()
  logger.info(`uploadId = ${uploadId}`)

  let submissionId
  let uploadType

  if (phaseTypeId === constants.phaseTypes['Final Fix']) {
    uploadType = constants.uploadTypes['Final Fix']
  } else {
    submissionId = await idSubmissionGen.getNextId()
    uploadType = constants.uploadTypes.Submission
  }

  const audits = {
    create_user: payload.memberId,
    create_date: momentTZ.tz(payload.created, timeZone).format('YYYY-MM-DD HH:mm:ss'),
    modify_user: payload.memberId,
    modify_date: momentTZ.tz(payload.created, timeZone).format('YYYY-MM-DD HH:mm:ss')
  }

  await insertRecord(connection, 'upload', {
    upload_id: uploadId,
    project_id: payload.challengeId,
    project_phase_id: payload.submissionPhaseId,
    resource_id: resourceId,
    upload_type_id: uploadType,
    url: payload.url,
    upload_status_id: constants.uploadStatus.Active,
    parameter: 'N/A',
    ...audits
  })

  let patchObject

  if (uploadType === constants.uploadTypes['Final Fix']) {
    logger.debug('final fix upload, only insert upload')
    patchObject = {
      legacyUploadId: uploadId
    }
  } else {
    await insertRecord(connection, 'submission', {
      submission_id: submissionId,
      upload_id: uploadId,
      submission_status_id: constants.submissionStatus.Active,
      submission_type_id: constants.submissionTypes[payload.type].id,
      ...audits
    })

    await insertRecord(connection, 'resource_submission', {
      submission_id: submissionId,
      resource_id: resourceId,
      ...audits
    })

    patchObject = {
      legacySubmissionId: submissionId
    }
  }

  logger.debug(`Patched to the Submission API: id ${payload.id}`)
  await submissionApiClient.patchSubmission(payload.id, patchObject)
}

createChallengeSubmission.schema = {
  payload: Joi.object().keys({
    resource: Joi.resource(),
    id: Joi.sid().required(),
    submissionPhaseId: Joi.id().required(),
    challengeId: Joi.id().required(),
    memberId: Joi.id().required(),
    url: Joi.string().uri().required(),
    type: Joi.string().required(),
    created: Joi.date().required()
  }).unknown(true).required()
}

/**
 * Process the Kafka message
 * @param {Object} message the kafka message
 */
async function processMessage (message) {
  if (message.originator !== config.INCOMING_KAFKA_ORIGINATOR) {
    logger.debug(`Skipped message from originator ${message.originator}`)
    return
  }

  // informix database connection
  const connection = await helper.getInformixConnection()

  try {
    // begin transaction
    await connection.beginTransactionAsync()

    if (message.payload.resource === constants.resources.submission && message.payload.originalTopic === config.KAFKA_NEW_SUBMISSION_TOPIC) {
      await this.createChallengeSubmission(connection, message.payload)
    } else {
      logger.debug(`Skipped message for resource ${message.payload.resource} and originalTopic ${message.payload.originalTopic}`)
    }

    // commit the transaction
    await connection.commitTransactionAsync()
  } catch (e) {
    await connection.rollbackTransactionAsync()
    throw e
  } finally {
    await connection.closeAsync()
  }
}

processMessage.schema = {
  message: Joi.object().keys({
    topic: Joi.string().required(),
    originator: Joi.string().required(),
    timestamp: Joi.date().required(),
    'mime-type': Joi.string().required(),
    payload: Joi.object().keys({
      resource: Joi.resource().required(),
      originalTopic: Joi.string().required()
    }).unknown(true).required()
  }).required()
}

module.exports = {
  createChallengeSubmission,
  processMessage
}

logger.buildService(module.exports)
