/**
 * The mock Submission && Challenge API.
 */
const _ = require('lodash')
const config = require('config')
const http = require('http')
const send = require('http-json-response')
const logger = require('../../src/common/logger')

// The good sample submission
const sampleSubmission = {
  id: 'cfdbc0cf-6443-433e-8af1-c56f318f2afd',
  challengeId: 30005521,
  memberId: 124916,
  resource: 'submission',
  url: 'http://content.topcoder.com/some/path',
  type: 'Contest Submission',
  submissionPhaseId: 95245,
  created: '2018-02-16T00:00:00'
}

const sampleUpdateSubmission = {
  id: 'cfdbc0cf-6445-433e-8af1-c56f317f2afd',
  originalTopic: 'submission.notification.update',
  challengeId: 30005521,
  legacySubmissionId: 2001,
  memberId: 124916,
  resource: 'submission',
  url: 'http://content.topcoder.com/some/path3',
  type: 'Contest Submission',
  submissionPhaseId: 95245,
  created: '2018-02-16T00:00:00'
}

// The good studio sample submission
const sampleStudioSubmission = {
  id: 'cfdbc0cf-6440-433e-8af1-c56f317f2afd',
  challengeId: 30005530,
  memberId: 124764,
  resource: 'submission',
  url: 'http://content.topcoder.com/some/path',
  type: 'Contest Submission',
  submissionPhaseId: 95284,
  created: '2018-02-16T00:00:00'
}

// The good no challenge properties sample submission
const sampleNoChallengePropertiesSubmission = {
  id: 'cfdbc0cf-6442-433e-8af1-c56f317f2afd',
  challengeId: 30005530,
  memberId: 132458,
  resource: 'submission',
  url: 'http://content.topcoder.com/some/path',
  type: 'Contest Submission',
  submissionPhaseId: 95308,
  created: '2018-02-16T00:00:00'
}

// The good final fix sample submission
const sampleFinalFixSubmission = {
  id: 'cfdbc0cf-6441-433e-8af1-c56f317f2afd',
  challengeId: 30005540,
  memberId: 132458,
  resource: 'submission',
  url: 'http://content.topcoder.com/some/path',
  type: 'Contest Submission',
  submissionPhaseId: 95308,
  created: '2018-02-16T00:00:00'
}

// The good not allow multiple submission sample submission
const sampleNotAllowMultipleSubmission = {
  id: 115,
  challengeId: 30005540,
  memberId: 132458,
  resource: 'submission',
  url: 'http://content.topcoder.com/some/path',
  type: 'Contest Submission',
  submissionPhaseId: 95301,
  created: '2018-02-16T00:00:00'
}

// The good sample MM submission
const sampleMMSubmission = {
  id: 'cfdbc0cf-6439-433e-8af1-c56f317f2afd',
  challengeId: 30054163,
  memberId: 132458,
  resource: 'submission',
  url: 'http://content.topcoder.com/some/path',
  type: 'Contest Submission',
  submissionPhaseId: 95311,
  updated: '2018-02-16T00:00:00',
  created: '2018-02-16T00:00:00'
}

// The good sample MM submission
const sampleMMSubmission2 = {
  id: 119,
  challengeId: 30054163,
  memberId: 124916,
  resource: 'submission',
  url: 'http://content.topcoder.com/some/path',
  type: 'Contest Submission',
  submissionPhaseId: 95311,
  updated: '2018-02-16T00:00:00',
  created: '2018-02-16T00:00:00'
}

// The good mm provisional review
const sampleMMProvisionalReview = {
  id: 'bcf2b43b-20df-44d1-afd3-7fc9798dfcac',
  resource: 'review',
  submissionId: 'cfdbc0cf-6444-433e-8af1-c56f317f2afd',
  typeId: 'bcf2b43b-20df-44d1-afd3-7fc9798dfcae',
  score: 90.2,
  metadata: {
    testType: 'provisional',
    testCases: [
      'DPK.CP001_A549_24H_X1_B42',
      'LITMUS.KD017_A549_96H_X1_B42'
    ]
  }
}

// The good mm provisional review
const sampleMMProvisionalReview2 = {
  id: 2,
  resource: 'review',
  submissionId: 119,
  typeId: 'bcf2b43b-20df-44d1-afd3-7fc9798dfcae',
  score: 92.3,
  metadata: {
    testType: 'provisional',
    testCases: [
      'DPK.CP001_A549_24H_X1_B42',
      'LITMUS.KD017_A549_96H_X1_B42'
    ]
  }
}

// The good mm final review
const sampleMMFinalReview = {
  id: 'bcf2b43b-20df-44d1-afd3-7fc9798dfcad',
  resource: 'reviewSummation',
  submissionId: 'cfdbc0cf-6444-433e-8af1-c56f317f2afd',
  aggregateScore: 97.5,
  metadata: {
    testType: 'final',
    testCases: [
      'DPK.CP001_A549_24H_X1_B42',
      'LITMUS.KD017_A549_96H_X1_B42'
    ]
  }
}

// The good mm final review
const sampleMMFinalReview2 = {
  id: 4,
  resource: 'reviewSummation',
  submissionId: 119,
  aggregateScore: 98.5,
  metadata: {
    testType: 'final',
    testCases: [
      'DPK.CP001_A549_24H_X1_B42',
      'LITMUS.KD017_A549_96H_X1_B42'
    ]
  }
}

const submissionWithNoLegacySubId = {
  resource: 'submission',
  id: 'cfdbc0cf-6443-433e-8af1-c56f317f2afd',
  type: 'Contest Submission',
  url: 'https://topcoder-dev-submissions.s3.amazonaws.com/cfdbc0cf-6443-433e-8af1-c56f317f2afd',
  memberId: 124916,
  challengeId: 30005521,
  created: '2018-07-31T17:05:17.835Z',
  updated: '2018-07-31T17:05:17.835Z',
  createdBy: 'callmekatootie',
  updatedBy: 'callmekatootie',
  submissionPhaseId: 95245,
  isFileSubmission: true,
  fileType: 'zip',
  filename: 'Photo on 7-30-18 at 11.47 AM #2.jpg'
}

const submissionWithLegacySubId = {
  resource: 'submission',
  id: 'cfdbc0cf-6445-433e-8af1-c56f317f2afd',
  type: 'Contest Submission',
  url: 'https://topcoder-dev-submissions.s3.amazonaws.com/cfdbc0cf-6445-433e-8af1-c56f317f2afd',
  memberId: 124916,
  challengeId: 30005521,
  legacySubmissionId: 2001,
  created: '2018-07-31T17:05:17.835Z',
  updated: '2018-07-31T17:05:17.835Z',
  createdBy: 'callmekatootie',
  updatedBy: 'callmekatootie',
  submissionPhaseId: 95245,
  isFileSubmission: true,
  fileType: 'zip',
  filename: 'Photo on 7-30-18 at 11.47 AM #2.jpg'
}

const submissionForMMWithLegacySubId = {
  id: 'cfdbc0cf-6444-433e-8af1-c56f317f2afd',
  legacySubmissionId: 2000,
  type: 'Contest Submission',
  url: 'https://topcoder-dev-submissions.s3.amazonaws.com/cfdbc0cf-6438-433e-8af1-c56f317f2afd',
  memberId: 124916,
  challengeId: 30054163,
  created: '2018-07-31T17:05:17.835Z',
  updated: '2018-07-31T17:05:17.835Z',
  createdBy: 'callmekatootie',
  updatedBy: 'callmekatootie',
  submissionPhaseId: 95245,
  isFileSubmission: true,
  fileType: 'zip',
  filename: 'Photo on 7-30-18 at 11.47 AM #2.jpg'
}

const submissions = {
  '/submissions/cfdbc0cf-6440-433e-8af1-c56f317f2afd': sampleStudioSubmission,
  '/submissions/cfdbc0cf-6441-433e-8af1-c56f317f2afd': sampleFinalFixSubmission,
  '/submissions/cfdbc0cf-6442-433e-8af1-c56f317f2afd': sampleNoChallengePropertiesSubmission,
  '/submissions/cfdbc0cf-6443-433e-8af1-c56f317f2afd': submissionWithNoLegacySubId,
  '/submissions/cfdbc0cf-6444-433e-8af1-c56f317f2afd': submissionForMMWithLegacySubId,
  '/submissions/cfdbc0cf-6445-433e-8af1-c56f317f2afd': submissionWithLegacySubId
}

// only include used properties and you may check real response from https://api.topcoder-dev.com/v4/challenges?filter=id=30005521
const getChallenge = (subTrack) => ({
  result: {
    content: [{ subTrack }]
  }
})
const challenges = {
  '/challenges?filter=id=30005521': getChallenge('DEVELOPMENT'),
  '/challenges?filter=id=30005540': getChallenge('ARCHITECTURE'),
  '/challenges?filter=id=30005530': getChallenge('DEVELOPMENT'),
  '/challenges?filter=id=30054163': getChallenge('DEVELOP_MARATHON_MATCH'),
  '/challenges?filter=id=30054164': getChallenge('DEVELOP_MARATHON_MATCH'),
  '/challenges?filter=id=60005521': getChallenge('')
}

const avScanReviewType = {
  id: 'cfdbc0cf-6437-434e-8af1-c56f317f2afd',
  name: 'AV SCAN',
  isActive: true
}

const regularReviewType = {
  id: 'cfdbc0cf-6437-435e-8af1-c56f317f2afd',
  name: 'Review',
  isActive: true
}

const reviewTypes = {
  '/reviewTypes?name=AV%20SCAN&': avScanReviewType,
  '/revieTypes?name=Review&': regularReviewType
}

const mockApi = http.createServer((req, res) => {
  logger.debug(`${req.method} ${req.url}`)
  // PUT /submissions/:id
  if ((req.method === 'PUT' || req.method === 'PATCH') &&
      (req.url.match(/^\/submissions\/[1-9]\d*$/) ||
       req.url.match(/^\/submissions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/gi))) {
    let body = ''
    req.on('data', chunk => {
      // Convert Buffer to string
      body += chunk.toString()
    })
    req.on('end', () => {
      logger.debug(`Patch ${req.url} with ${body}`)

      if (submissions[req.url]) {
        const patchObject = JSON.parse(body)
        _.merge(submissions[req.url], patchObject)
      }
      // Always return 200 response
      res.statusCode = 200
      res.end()
    })
  } else if (req.method === 'GET' &&
    (req.url.match(/^\/submissions\/[1-9]\d*$/) ||
     req.url.match(/^\/submissions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/gi))) {
    return send(res, 200, submissions[req.url])
  } else if (req.method === 'GET' && Object.keys(challenges).includes(req.url)) {
    return send(res, 200, challenges[req.url])
  } else if (req.method === 'GET' && req.url.match(/^\/challenges\?filter=id=\d+$/)) {
    // default to mock as mm challenge
    return send(res, 200, getChallenge('DEVELOP_MARATHON_MATCH'))
  } else if (req.method === 'GET' && Object.keys(reviewTypes).includes(req.url)) {
    return send(res, 200, [reviewTypes[req.url]])
  } else {
    // 404 for other routes
    res.statusCode = 404
    res.end('Not Found')
  }
})

if (!module.parent) {
  const port = config.MOCK_API_PORT || 3001
  mockApi.listen(port)
  console.log(`mock submission api is listen port ${port}`)
}

module.exports = {
  sampleSubmission,
  sampleFinalFixSubmission,
  sampleStudioSubmission,
  sampleNotAllowMultipleSubmission,
  sampleNoChallengePropertiesSubmission,
  sampleMMSubmission,
  sampleMMProvisionalReview,
  sampleMMFinalReview,
  sampleMMSubmission2,
  sampleMMProvisionalReview2,
  sampleMMFinalReview2,
  mockApi,
  sampleUpdateSubmission
}
