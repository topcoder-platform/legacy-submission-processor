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
const InformixService = require('./InformixService')

const idUploadGen = new IDGenerator(config.ID_SEQ_UPLOAD)
const idSubmissionGen = new IDGenerator(config.ID_SEQ_SUBMISSION)

const submissionApiClient = submissionApi(_.pick(config, [
  'AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'SUBMISSION_API_URL', 'AUTH0_PROXY_SERVER_URL']))

const timeZone = 'America/New_York'

/**
 * Create challenge submission
 * @param {Object} payload the message payload
 */
async function createChallengeSubmission (payload) {
  // informix database connection
  logger.info(`Creating Submission for ${payload.id}`)
  const connection = await helper.getInformixConnection()

  try {
    await connection.beginTransactionAsync()

    const {
      resourceId,
      phaseTypeId
    } = await InformixService.getChallengeProperties(connection, payload.challengeId, payload.memberId, constants.submissionTypes[payload.type].roleId, payload.submissionPhaseId)

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

    await InformixService.insertRecord(connection, 'upload', {
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
      await InformixService.insertRecord(connection, 'submission', {
        submission_id: submissionId,
        upload_id: uploadId,
        submission_status_id: constants.submissionStatus.Active,
        submission_type_id: constants.submissionTypes[payload.type].id,
        ...audits
      })

      await InformixService.insertRecord(connection, 'resource_submission', {
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

    await connection.commitTransactionAsync()
  } catch (e) {
    logger.error(`Error in 'create submission' ${e}`)
    await connection.rollbackTransactionAsync()
    throw e
  } finally {
    logger.info(`Submission created for ${payload.id}`)
    await connection.closeAsync()
  }
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

  switch (message.payload.resource) {
    // handle submission resource
    case constants.resources.submission:
      await processSubmission(message.payload)
      break

    // handle review resource
    case constants.resources.review:
      await processReview(message.payload)
      break

    // handle review summation resource
    case constants.resources.reviewSummation:
      await processReviewSummation(message.payload)
      break
  }
}

processMessage.schema = {
  message: Joi.object().keys({
    topic: Joi.string().required(),
    originator: Joi.string().required(),
    timestamp: Joi.date().required(),
    'mime-type': Joi.string().required(),
    payload: Joi.object().keys({
      id: Joi.sid().required(),
      resource: Joi.resource().required(),
      originalTopic: Joi.string()
        .when('resource', { is: constants.resources.submission, then: Joi.string().required() }),
      submissionPhaseId: Joi.id()
        .when('resource', { is: constants.resources.submission, then: Joi.id().required() }),
      challengeId: Joi.id()
        .when('resource', { is: constants.resources.submission, then: Joi.id().required() }),
      memberId: Joi.id()
        .when('resource', { is: constants.resources.submission, then: Joi.id().required() }),
      type: Joi.string()
        .when('resource', { is: constants.resources.submission, then: Joi.string().required() }),
      created: Joi.date()
        .when('originalTopic', { is: config.KAFKA_NEW_SUBMISSION_TOPIC, then: Joi.date().required() }),
      url: Joi.string(),
      legacySubmissionId: Joi.id()
    }).unknown(true).required()
  }).required()
}

/**
 * Update challenge submission
 * @param {Object} payload the message payload
 */
async function updateChallengeSubmission (payload) {
  logger.info(`Updating Submission for ${payload.id}`)
  let legacySubmissionId = payload.legacySubmissionId
  if (!legacySubmissionId) {
    // The legacy submission id is not provided in the payload, we get it from the submissions-api
    const submission = await submissionApiClient.getSubmission(payload.id)
    legacySubmissionId = submission.body.legacySubmissionId || 0
  }

  if (legacySubmissionId !== 0 || !payload.url) {
    // informix database connection
    const connection = await helper.getInformixConnection()

    try {
      await connection.beginTransactionAsync()

      await InformixService.updateUploadUrl(connection, payload.url, legacySubmissionId)
      logger.debug(`Updated submission : id ${payload.id}, url ${payload.url}, legacySubmissionId ${legacySubmissionId}`)

      await connection.commitTransactionAsync()
    } catch (e) {
      logger.error(`Error in updating Submission for ${payload.id}`)
      await connection.rollbackTransactionAsync()
      throw e
    } finally {
      logger.info(`Completed updating submission for ${payload.id}`)
      await connection.closeAsync()
    }
  } else {
    logger.debug('legacy submission id not found / payload url not available, no update performed')
  }
}

updateChallengeSubmission.schema = {
  payload: Joi.object().keys({
    id: Joi.sid().required(),
    url: Joi.string().uri(),
    legacySubmissionId: Joi.id()
  }).unknown(true).required()
}

/**
 * This function processes the submission resource.
 * It either creates or updates the submission resource based on the originalTopic
 *
 * @param {Object} payload The submission event payload.
 */
async function processSubmission (payload) {
  switch (payload.originalTopic) {
    // create submission event
    case config.KAFKA_NEW_SUBMISSION_TOPIC:
      await createChallengeSubmission(payload)
      break

    // update submission event
    case config.KAFKA_UPDATE_SUBMISSION_TOPIC:
      if (payload.legacySubmissionId) {
        logger.debug(`Skipped message for resource ${payload.resource} and originalTopic ${payload.originalTopic}`)
      } else {
        await updateChallengeSubmission(payload)
      }
      break

    default:
      logger.debug(`Skipped message for resource ${payload.resource} and originalTopic ${payload.originalTopic}`)
      break
  }
}

processSubmission.schema = {
  payload: Joi.object().keys({
    resource: Joi.resource(),
    id: Joi.sid().required(),
    url: Joi.string().uri().required(),
    legacySubmissionId: Joi.id(),
    originalTopic: Joi.string().required()
  }).unknown(true).required()
}

/**
 * This function is responsible of processing the review event.
 *
 * @param {Object} payload The create review event payload
 */
async function processReview (payload) {
  logger.info(`Updating provisional score for ${payload.submissionId}`)
  // Only events related to 'provisional' tests need to be considered
  const testType = _.get(payload, 'metadata.testType')
  if (testType !== constants.reviewTestTypes.provisional) {
    logger.debug(`Skipped non provisional test type: ${testType}`)
    return
  }

  // Ignore Antivirus scan review type
  const avScanTypeId = await helper.getReviewTypeId(constants.reviewTypes.AntivirusScan)
  if (payload.typeId === avScanTypeId) {
    logger.debug(`Ignoring AV Scan review for submission ${payload.submissionId}`)
    return
  }

  // Get the submission from submission API
  const response = await submissionApiClient.getSubmission(payload.submissionId)
  const submission = response.body

  // Validate the required fields for the submission
  await helper.validateSubmissionFields(submission, ['memberId', 'submissionPhaseId', 'type', 'legacySubmissionId'])

  // informix database connection
  const connection = await helper.getInformixConnection()

  try {
    await connection.beginTransactionAsync()
    // Update the provisional score for the submission
    await InformixService.updateProvisionalScore(
      connection,
      submission.challengeId,
      submission.memberId,
      submission.submissionPhaseId,
      submission.legacySubmissionId,
      submission.type,
      payload.score)

    await connection.commitTransactionAsync()
  } catch (e) {
    logger.error(`Error in updating provisional score for ${payload.submissionId}`)
    await connection.rollbackTransactionAsync()
    throw e
  } finally {
    logger.info(`Compelted updating provisional score for ${payload.submissionId}`)
    await connection.closeAsync()
  }
}

processReview.schema = {
  payload: Joi.object().keys({
    id: Joi.sid().required(),
    submissionId: Joi.sid().required(),
    score: Joi.number().min(0).max(100).required(),
    metadata: Joi.object().keys({
      testType: Joi.string().required()
    }).unknown(true),
    typeId: Joi.string()
  }).unknown(true).required()
}

/**
 * This function is responsible of processing the review summation event.
 *
 * @param {Object} payload The review summation event payload.
 */
async function processReviewSummation (payload) {
  logger.info(`Updating final score for ${payload.submissionId}`)
  // Get the submission from submissions API
  const response = await submissionApiClient.getSubmission(payload.submissionId)
  const submission = response.body

  await helper.validateSubmissionFields(submission, ['memberId', 'legacySubmissionId'])

  // informix database connection
  const connection = await helper.getInformixConnection()

  try {
    await connection.beginTransactionAsync()

    await InformixService.updateFinalScore(
      connection,
      submission.challengeId,
      submission.memberId,
      submission.legacySubmissionId,
      payload.aggregateScore
    )

    await connection.commitTransactionAsync()
  } catch (e) {
    logger.error(`Completed updating final score for ${payload.submissionId}`)
    await connection.rollbackTransactionAsync()
    throw e
  } finally {
    logger.info(`Error in updating final score for ${payload.submissionId}`)
    await connection.closeAsync()
  }
}

processReviewSummation.schema = {
  payload: Joi.object().keys({
    id: Joi.sid().required(),
    submissionId: Joi.sid().required(),
    aggregateScore: Joi.number().positive().required()
  }).unknown(true).required()
}

module.exports = {
  processMessage,
  processSubmission,
  createChallengeSubmission,
  updateChallengeSubmission,
  processReview,
  processReviewSummation
}

logger.buildService(module.exports)
