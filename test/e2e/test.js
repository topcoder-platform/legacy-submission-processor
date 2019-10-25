/**
 * E2E test of the legacy submission processor.
 */
process.env.NODE_ENV = 'test'
require('../../src/bootstrap')
const _ = require('lodash')
const config = require('config')
const should = require('should')
const Kafka = require('no-kafka')
const request = require('superagent')
const logger = require('../../src/common/logger')
const {
  sampleSubmission,
  sampleFinalFixSubmission,
  sampleStudioSubmission,
  sampleNoChallengePropertiesSubmission,
  mockApi
} = require('../mock/mock-api')
const { createChallengeSubmission } = require('../common/testData')
const { getInformixConnection, getKafkaOptions } = require('../../src/common/helper')
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

describe('Topcoder - Legacy Submission Processor E2E tests', () => {
  let app
  let connection
  let infoLogs = []
  let errorLogs = []
  let debugLogs = []
  const info = logger.info
  const error = logger.error
  const debug = logger.debug

  const producer = new Kafka.Producer(getKafkaOptions())

  /**
   * Sleep with time from input
   * @param time the time input
   */
  const sleep = (time) => {
    return new Promise((resolve) => {
      setTimeout(resolve, time)
    })
  }

  /**
   * Send message
   * @param testMessage the test message
   */
  const sendMessage = async (testMessage) => {
    await producer.send({
      topic: testMessage.topic,
      message: {
        value: JSON.stringify(testMessage)
      }
    })
  }

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
   * Consume not committed messages before e2e test
   */
  const consumeMessages = async () => {
    // remove all not processed messages
    const consumer = new Kafka.GroupConsumer(getKafkaOptions())
    await consumer.init([{
      subscriptions: [config.KAFKA_AGGREGATE_SUBMISSION_TOPIC],
      handler: (messageSet, topic, partition) => Promise.each(messageSet,
        (m) => consumer.commitOffset({ topic, partition, offset: m.offset }))
    }])
    // make sure process all not committed messages before test
    await sleep(2 * config.WAIT_TIME)
    await consumer.end()
  }

  /**
   * Wait job finished with successful log or error log is found
   */
  const waitJob = async () => {
    while (true) {
      if (errorLogs.length > 0) {
        break
      }
      if (debugLogs.some(x => String(x).includes('Successfully processed message'))) {
        break
      }
      // use small time to wait job and will use global timeout so will not wait too long
      await sleep(config.WAIT_TIME)
    }
  }

  const assertErrorMessage = (message) => {
    errorLogs.should.not.be.empty()
    errorLogs.some(x => String(x).includes(message)).should.be.true()
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
    await consumeMessages()
    // start kafka producer
    await producer.init()
    // start the application (kafka listener)
    app = require('../../src/app')
    // wait until consumer init successfully
    while (true) {
      if (infoLogs.some(x => String(x).includes('Kick Start'))) {
        break
      }
      await sleep(config.WAIT_TIME)
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

    try {
      await producer.end()
    } catch (err) {
      // ignore
    }
    try {
      await app.end()
    } catch (err) {
      // ignore
    }

    await connection.closeAsync()
  })

  beforeEach(() => {
    // clear logs
    infoLogs = []
    debugLogs = []
    errorLogs = []
  })

  it('Should setup healthcheck with check on kafka connection', async () => {
    const healthcheckEndpoint = `http://localhost:${process.env.PORT || 3000}/health`
    const result = await request.get(healthcheckEndpoint)
    should.equal(result.status, 200)
    should.deepEqual(result.body, { checksRun: 1 })
    debugLogs.should.match(/connected=true/)
  })

  it('Should handle invalid json message', async () => {
    await producer.send({
      topic: sampleMessage.topic,
      message: {
        value: '[ invalid'
      }
    })
    await waitJob()
    should.equal(errorLogs[0], 'Invalid message JSON.')
  })

  it('Should handle incorrect topic field message', async () => {
    const message = _.cloneDeep(sampleMessage)
    message.topic = 'invalid'
    await producer.send({
      topic: sampleMessage.topic,
      message: {
        value: JSON.stringify(message)
      }
    })
    await waitJob()
    should.equal(errorLogs[0], `The message topic invalid doesn't match the Kafka topic ${config.KAFKA_AGGREGATE_SUBMISSION_TOPIC}.`)
  })

  it('should handle new submission message successfully', async () => {
    await clearSubmissions()

    await sendMessage(sampleMessage)
    await waitJob()

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

    await sendMessage(sampleFinalFixMessage)
    await waitJob()

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

    await sendMessage(sampleStudioMessage)
    await waitJob()

    should.ok(debugLogs.find(x => x.startsWith(`Patched to the Submission API: id ${sampleStudioMessage.payload.id}`)))

    let result = await connection.queryAsync(`select count(*) as cnt from upload where project_id = ${sampleStudioMessage.payload.challengeId} and project_phase_id = ${sampleStudioMessage.payload.submissionPhaseId} and url = '${sampleStudioMessage.payload.url}'`)
    should.equal(1, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from submission')
    should.equal(1, result[0].cnt)
    result = await connection.queryAsync('select count(*) as cnt from resource_submission')
    should.equal(1, result[0].cnt)
  })

  it('should log error for new submission without challenge properties', async () => {
    await sendMessage(sampleNoChallengePropertiesMessage)
    await waitJob()

    assertErrorMessage('Empty result get challenge properties')
  })

  it('should skip message for incorrect originator', async () => {
    const message = _.cloneDeep(sampleMessage)
    message.originator = 'invalid'

    await sendMessage(message)
    await waitJob()

    should.equal(debugLogs[3], `Skipped message from originator ${message.originator}`)
  })

  it('should skip message for resource \'review\'', async () => {
    const message = _.cloneDeep(sampleMessage)
    message.payload.resource = 'review'

    await sendMessage(message)
    await waitJob()

    should.equal(debugLogs[3], `Skipped message for resource ${message.payload.resource} and originalTopic ${message.payload.originalTopic}`)
  })

  it('should skip message for originalTopic \'submission.notification.update\'', async () => {
    const message = _.cloneDeep(sampleMessage)
    message.payload.originalTopic = 'submission.notification.update'

    await sendMessage(message)
    await waitJob()

    should.equal(debugLogs[3], `Skipped message for resource ${message.payload.resource} and originalTopic ${message.payload.originalTopic}`)
  })

  for (const requiredField of createChallengeSubmission.requiredFields) {
    it(`test invalid parameters, required field ${requiredField} is missing`, async () => {
      let message = _.cloneDeep(sampleMessage)
      message = _.omit(message, requiredField)
      await sendMessage(message)
      await waitJob()

      assertErrorMessage(`"${_.last(requiredField.split('.'))}" is required`)
    })
  }

  for (const stringField of createChallengeSubmission.stringFields) {
    it(`test invalid parameters, invalid string type field ${stringField}`, async () => {
      const message = _.cloneDeep(sampleMessage)
      _.set(message, stringField, 123)
      await sendMessage(message)
      await waitJob()

      assertErrorMessage(`"${_.last(stringField.split('.'))}" must be a string`)
    })
  }

  for (const integerField of createChallengeSubmission.integerFields) {
    it(`test invalid parameters, invalid integer type field ${integerField}(wrong number)`, async () => {
      const message = _.cloneDeep(sampleMessage)
      _.set(message, integerField, 'string')
      await sendMessage(message)
      await waitJob()

      assertErrorMessage(`"${_.last(integerField.split('.'))}" must be a number`)
    })

    it(`test invalid parameters, invalid integer type field ${integerField}(wrong integer)`, async () => {
      const message = _.cloneDeep(sampleMessage)
      _.set(message, integerField, 1.1)
      await sendMessage(message)
      await waitJob()

      assertErrorMessage(`"${_.last(integerField.split('.'))}" must be an integer`)
    })
  }

  for (const dateField of createChallengeSubmission.dateFields) {
    it(`test invalid parameters, invalid date type field ${dateField}`, async () => {
      const message = _.cloneDeep(sampleMessage)
      _.set(message, dateField, 'invalid')
      await sendMessage(message)
      await waitJob()

      assertErrorMessage(`"${_.last(dateField.split('.'))}" must be a number of milliseconds or valid date string`)
    })
  }
})
