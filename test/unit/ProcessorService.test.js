/**
 * Unit test of the legacy submission processor.
 */
process.env.NODE_ENV = 'test'
require('../../src/bootstrap')
const _ = require('lodash')
const config = require('config')
const should = require('should')
const logger = require('../../src/common/logger')
const service = require('../../src/services/ProcessorService')
const {
  sampleSubmission,
  sampleFinalFixSubmission,
  sampleStudioSubmission,
  sampleNoChallengePropertiesSubmission,
  mockApi,
  sampleUpdateSubmission,
  sampleMMFinalReview,
  sampleMMProvisionalReview
} = require('../mock/mock-api')
const {
  createChallengeSubmission,
  updateChallengeSubmission,
  processReviewSummation,
  processReview,
  AntivirusScanTypeId
} = require('../common/testData')
const { getInformixConnection } = require('../../src/common/helper')
const { clearTestData, insertTestData } = require('../common/testHelper')

const header = {
  topic: config.KAFKA_AGGREGATE_SUBMISSION_TOPIC,
  originator: config.INCOMING_KAFKA_ORIGINATOR,
  timestamp: '2018-02-16T00:00:00',
  'mime-type': 'application/json'
}
// The sample message for new submission
const sampleNewSubmissionMessage = {
  ...header,
  payload: {
    originalTopic: config.KAFKA_NEW_SUBMISSION_TOPIC,
    ...sampleSubmission
  }
}

// The sample message for update submission
const sampleUpdateSubmissionMessage = {
  ...header,
  payload: {
    originalTopic: config.KAFKA_UPDATE_SUBMISSION_TOPIC,
    ...sampleUpdateSubmission
  }
}

// The good final fix sample message
const sampleFinalFixMessage = {
  ...header,
  payload: {
    originalTopic: config.KAFKA_NEW_SUBMISSION_TOPIC,
    ...sampleFinalFixSubmission
  }
}

// The good studio sample message
const sampleStudioMessage = {
  ...header,
  payload: {
    originalTopic: config.KAFKA_NEW_SUBMISSION_TOPIC,
    ...sampleStudioSubmission
  }
}

// The good no challenge properties sample message
const sampleNoChallengePropertiesMessage = {
  ...header,
  payload: {
    originalTopic: config.KAFKA_NEW_SUBMISSION_TOPIC,
    ...sampleNoChallengePropertiesSubmission
  }
}

describe('Topcoder - Legacy Submission Processor Unit tests', () => {
  let connection
  let infoLogs = []
  let errorLogs = []
  let debugLogs = []
  const info = logger.info
  const error = logger.error
  const debug = logger.debug

  /**
   * Start http server with port
   * @param {Object} server the server
   * @param {Number} port the server port
   */
  const startServer = (server, port) => new Promise((resolve) => {
    server.listen(port, () => {
      resolve()
    })
  })

  /**
   * Close http server
   */
  const closeServer = (server) => new Promise((resolve) => {
    server.close(() => {
      resolve()
    })
  })

  /**
   * Assert validation error
   * @param err the error
   * @param message the message
   */
  function assertValidationError (err, message) {
    err.isJoi.should.be.true()
    should.equal(err.name, 'ValidationError')
    err.details.map(x => x.message).should.containEql(message)
    errorLogs.should.not.be.empty()
  }

  before(async () => {
    await startServer(mockApi, config.MOCK_API_PORT)

    // inject logger with log collector
    logger.info = (message) => {
      infoLogs.push(message)
      info(message)
    }
    logger.debug = (message) => {
      debugLogs.push(message)
      debug(message)
    }
    logger.error = (message) => {
      errorLogs.push(message)
      error(message)
    }

    connection = await getInformixConnection()
  })

  after(async () => {
    // close server
    await closeServer(mockApi)

    // restore logger
    logger.error = error
    logger.info = info
    logger.debug = debug

    await connection.closeAsync()
  })

  beforeEach(() => {
    // clear logs
    infoLogs = []
    debugLogs = []
    errorLogs = []
  })

  it('should handle new submission message successfully', async () => {
    await clearTestData()

    await service.processMessage(sampleNewSubmissionMessage)

    should.ok(debugLogs.find(x => x.startsWith(`Patched to the Submission API: id ${sampleNewSubmissionMessage.payload.id}`)))

    let result = await connection.queryAsync(`select count(*) as cnt from upload where project_id = ${sampleNewSubmissionMessage.payload.challengeId} and project_phase_id = ${sampleNewSubmissionMessage.payload.submissionPhaseId} and url = '${sampleNewSubmissionMessage.payload.url}'`)
    should.equal(1, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from submission')
    should.equal(1, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from resource_submission')
    should.equal(1, result[0].cnt)
  })

  it('should handle final fix message successfully', async () => {
    await clearTestData()

    await service.processMessage(sampleFinalFixMessage)

    should.ok(debugLogs.find(x => x.startsWith(`Patched to the Submission API: id ${sampleFinalFixMessage.payload.id}`)))

    let result = await connection.queryAsync(`select count(*) as cnt from upload where project_id = ${sampleFinalFixMessage.payload.challengeId} and project_phase_id = ${sampleFinalFixMessage.payload.submissionPhaseId} and url = '${sampleFinalFixMessage.payload.url}'`)
    should.equal(1, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from submission')
    should.equal(0, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from resource_submission')
    should.equal(0, result[0].cnt)
  })

  it('should handle new studio submission message successfully', async () => {
    await clearTestData()

    await service.processMessage(sampleStudioMessage)

    should.ok(debugLogs.find(x => x.startsWith(`Patched to the Submission API: id ${sampleStudioMessage.payload.id}`)))

    let result = await connection.queryAsync(`select count(*) as cnt from upload where project_id = ${sampleStudioMessage.payload.challengeId} and project_phase_id = ${sampleStudioMessage.payload.submissionPhaseId} and url = '${sampleStudioMessage.payload.url}'`)
    should.equal(1, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from submission')
    should.equal(1, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from resource_submission')
    should.equal(1, result[0].cnt)
  })

  it('should log error for new submission without challenge properties', async () => {
    try {
      await service.processMessage(sampleNoChallengePropertiesMessage)
      throw new Error('should not throw error here')
    } catch (err) {
      should.equal(err.message.startsWith('Empty result get challenge properties'), true)
    }
  })

  it('should skip message for incorrect originator', async () => {
    const message = _.cloneDeep(sampleNewSubmissionMessage)
    message.originator = 'invalid'

    await service.processMessage(message)

    should.equal(debugLogs[3], `Skipped message from originator ${message.originator}`)
  })

  for (const requiredField of createChallengeSubmission.requiredFields) {
    it(`test invalid parameters, required field ${requiredField} is missing`, async () => {
      let message = _.cloneDeep(sampleNewSubmissionMessage)
      message = _.omit(message, requiredField)

      try {
        await service.processMessage(message)
        throw new Error('should not throw error here')
      } catch (err) {
        assertValidationError(err, `"${_.last(requiredField.split('.'))}" is required`)
      }
    })
  }

  for (const stringField of createChallengeSubmission.stringFields) {
    it(`test invalid parameters, invalid string type field ${stringField}`, async () => {
      const message = _.cloneDeep(sampleNewSubmissionMessage)
      _.set(message, stringField, 123)

      try {
        await service.processMessage(message)
        throw new Error('should not throw error here')
      } catch (err) {
        assertValidationError(err, `"${_.last(stringField.split('.'))}" must be a string`)
      }
    })
  }

  for (const integerField of createChallengeSubmission.integerFields) {
    it(`test invalid parameters, invalid integer type field ${integerField}(wrong number)`, async () => {
      const message = _.cloneDeep(sampleNewSubmissionMessage)
      _.set(message, integerField, 'string')

      try {
        await service.processMessage(message)
        throw new Error('should not throw error here')
      } catch (err) {
        assertValidationError(err, `"${_.last(integerField.split('.'))}" must be a number`)
      }
    })

    it(`test invalid parameters, invalid integer type field ${integerField}(wrong integer)`, async () => {
      const message = _.cloneDeep(sampleNewSubmissionMessage)
      _.set(message, integerField, 1.1)

      try {
        await service.processMessage(message)
        throw new Error('should not throw error here')
      } catch (err) {
        assertValidationError(err, `"${_.last(integerField.split('.'))}" must be an integer`)
      }
    })
  }

  for (const dateField of createChallengeSubmission.dateFields) {
    it(`test invalid parameters, invalid date type field ${dateField}`, async () => {
      const message = _.cloneDeep(sampleNewSubmissionMessage)
      _.set(message, dateField, 'invalid')

      try {
        await service.processMessage(message)
        throw new Error('should not throw error here')
      } catch (err) {
        assertValidationError(err, `"${_.last(dateField.split('.'))}" must be a number of milliseconds or valid date string`)
      }
    })
  }

  describe('update challenge submission tests', () => {
    before(async () => {
      await insertTestData()
    })

    after(async () => {
      await clearTestData()
    })

    for (const requiredField of updateChallengeSubmission.requiredFields) {
      it(`test invalid parameters, required field ${requiredField} is missing`, async () => {
        let message = _.cloneDeep(sampleUpdateSubmissionMessage)
        message = _.omit(message, requiredField)

        try {
          await service.processMessage(message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"${_.last(requiredField.split('.'))}" is required`)
        }
      })
    }

    for (const stringField of updateChallengeSubmission.stringFields) {
      it(`test invalid parameters, invalid string type field ${stringField}`, async () => {
        const message = _.cloneDeep(sampleUpdateSubmissionMessage)
        _.set(message, stringField, 123)

        try {
          await service.processMessage(message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"${_.last(stringField.split('.'))}" must be a string`)
        }
      })
    }

    for (const integerField of updateChallengeSubmission.integerFields) {
      it(`test invalid parameters, invalid integer type field ${integerField}(wrong number)`, async () => {
        const message = _.cloneDeep(sampleUpdateSubmissionMessage)
        _.set(message, integerField, 'string')

        try {
          await service.processMessage(message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"${_.last(integerField.split('.'))}" must be a number`)
        }
      })

      it(`test invalid parameters, invalid integer type field ${integerField}(wrong integer)`, async () => {
        const message = _.cloneDeep(sampleUpdateSubmissionMessage)
        _.set(message, integerField, 1.1)

        try {
          await service.processMessage(message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"${_.last(integerField.split('.'))}" must be an integer`)
        }
      })
    }

    it('should handle update submission message successfully', async () => {
      await service.processMessage(sampleUpdateSubmissionMessage)

      const result = await connection.queryAsync(`select u.url from upload u, submission s
         where u.upload_id = s.upload_id and s.submission_id = ${sampleUpdateSubmissionMessage.payload.legacySubmissionId}`)

      should.equal(result.length, 1)
      should.equal(result[0].url, sampleUpdateSubmissionMessage.payload.url)
    })
  })

  describe('process review summation tests', () => {
    before(async () => {
      await insertTestData()
    })

    after(async () => {
      await clearTestData()
    })

    for (const requiredField of processReviewSummation.requiredFields) {
      it(`test invalid parameters, required field ${requiredField} is missing`, async () => {
        let message = _.cloneDeep(sampleMMFinalReview)
        message = _.omit(message, requiredField)

        try {
          await service.processReviewSummation(connection, message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"${_.last(requiredField.split('.'))}" is required`)
        }
      })
    }

    for (const numberField of processReviewSummation.numberFields) {
      it(`test invalid parameters, invalid integer type field ${numberField}(wrong number)`, async () => {
        const message = _.cloneDeep(sampleMMFinalReview)
        _.set(message, numberField, 'string')

        try {
          await service.processReviewSummation(connection, message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"${_.last(numberField.split('.'))}" must be a number`)
        }
      })
    }

    it('should properly process review summation event', async () => {
      await service.processReviewSummation(connection, sampleMMFinalReview)

      const dbResult = await connection.queryAsync('select final_score from submission where submission_id = 2000')

      should.equal(dbResult.length, 1)
      should.equal(Number(dbResult[0].final_score), sampleMMFinalReview.aggregateScore)
    })
  })

  describe('process review tests', () => {
    before(async () => {
      await insertTestData()
    })

    after(async () => {
      await clearTestData()
    })

    for (const requiredField of processReview.requiredFields) {
      it(`test invalid parameters, required field ${requiredField} is missing`, async () => {
        let message = _.cloneDeep(sampleMMProvisionalReview)
        message = _.omit(message, requiredField)

        try {
          await service.processReview(connection, message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"${_.last(requiredField.split('.'))}" is required`)
        }
      })
    }

    for (const stringField of processReview.stringFields) {
      it(`test invalid parameters, invalid string type field ${stringField}`, async () => {
        const message = _.cloneDeep(sampleMMProvisionalReview)
        _.set(message, stringField, 123)

        try {
          await service.processReview(connection, message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"${_.last(stringField.split('.'))}" must be a string`)
        }
      })
    }

    for (const numberField of processReview.numberFields) {
      it(`test invalid parameters, invalid integer type field ${numberField}(wrong number)`, async () => {
        const message = _.cloneDeep(sampleMMProvisionalReview)
        _.set(message, numberField, 'string')

        try {
          await service.processReview(connection, message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"${_.last(numberField.split('.'))}" must be a number`)
        }
      })
    }

    it('should successfully process review', async () => {
      await service.processReview(connection, sampleMMProvisionalReview)

      let result = await connection.queryAsync('select initial_score from submission where submission_id = 2000')

      should.equal(result.length, 1)
      should.equal(Number(result[0].initial_score), sampleMMProvisionalReview.score)

      result = await connection.queryAsync(`select submission_points from informixoltp:long_submission
      where long_component_state_id=7000 and submission_number=1 and example=0`)

      should.equal(result.length, 1)
      should.equal(Number(result[0].submission_points), sampleMMProvisionalReview.score)

      result = await connection.queryAsync(`select points from informixoltp:long_component_state
      where long_component_state_id=7000`)

      should.equal(result.length, 1)
      should.equal(Number(result[0].points), sampleMMProvisionalReview.score)
    })

    it('should skip message for Antivirus scan', async () => {
      const message = _.cloneDeep(sampleMMProvisionalReview)
      message.typeId = AntivirusScanTypeId

      await service.processReview(connection, message)

      should.ok(debugLogs.find(x => x.startsWith(`Ignoring AV Scan review for submission ${sampleMMProvisionalReview.submissionId}`)))
    })
  })
})
