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
  mockApi
} = require('../mock/mock-api')
const { createChallengeSubmission } = require('../common/testData')
const { getInformixConnection } = require('../../src/common/helper')
const { clearSubmissions } = require('../common/testHelper')

const header = {
  topic: config.KAFKA_AGGREGATE_SUBMISSION_TOPIC,
  originator: config.INCOMING_KAFKA_ORIGINATOR,
  timestamp: '2018-02-16T00:00:00',
  'mime-type': 'application/json'
}
// The good sample message
const sampleMessage = {
  ...header,
  payload: {
    originalTopic: config.KAFKA_NEW_SUBMISSION_TOPIC,
    ...sampleSubmission
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
    await clearSubmissions()

    await service.processMessage(sampleMessage)

    should.ok(debugLogs.find(x => x.startsWith(`Patched to the Submission API: id ${sampleMessage.payload.id}`)))

    let result = await connection.queryAsync(`select count(*) as cnt from upload where project_id = ${sampleMessage.payload.challengeId} and project_phase_id = ${sampleMessage.payload.submissionPhaseId} and url = '${sampleMessage.payload.url}'`)
    should.equal(1, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from submission')
    should.equal(1, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from resource_submission')
    should.equal(1, result[0].cnt)
  })

  it('should handle final fix message successfully', async () => {
    await clearSubmissions()

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
    await clearSubmissions()

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
    const message = _.cloneDeep(sampleMessage)
    message.originator = 'invalid'

    await service.processMessage(message)

    should.equal(debugLogs[3], `Skipped message from originator ${message.originator}`)
  })

  it('should skip message for resource \'review\'', async () => {
    const message = _.cloneDeep(sampleMessage)
    message.payload.resource = 'review'

    await service.processMessage(message)

    should.equal(debugLogs[3], `Skipped message for resource ${message.payload.resource} and originalTopic ${message.payload.originalTopic}`)
  })

  it('should skip message for originalTopic \'submission.notification.update\'', async () => {
    const message = _.cloneDeep(sampleMessage)
    message.payload.originalTopic = 'submission.notification.update'

    await service.processMessage(message)

    should.equal(debugLogs[3], `Skipped message for resource ${message.payload.resource} and originalTopic ${message.payload.originalTopic}`)
  })

  for (const requiredField of createChallengeSubmission.requiredFields) {
    it(`test invalid parameters, required field ${requiredField} is missing`, async () => {
      let message = _.cloneDeep(sampleMessage)
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
      const message = _.cloneDeep(sampleMessage)
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
      const message = _.cloneDeep(sampleMessage)
      _.set(message, integerField, 'string')

      try {
        await service.processMessage(message)
        throw new Error('should not throw error here')
      } catch (err) {
        assertValidationError(err, `"${_.last(integerField.split('.'))}" must be a number`)
      }
    })

    it(`test invalid parameters, invalid integer type field ${integerField}(wrong integer)`, async () => {
      const message = _.cloneDeep(sampleMessage)
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
      const message = _.cloneDeep(sampleMessage)
      _.set(message, dateField, 'invalid')

      try {
        await service.processMessage(message)
        throw new Error('should not throw error here')
      } catch (err) {
        assertValidationError(err, `"${_.last(dateField.split('.'))}" must be a number of milliseconds or valid date string`)
      }
    })
  }
})
