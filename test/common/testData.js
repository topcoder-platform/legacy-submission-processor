module.exports = {
  createChallengeSubmission: {
    requiredFields: ['originator', 'timestamp', 'mime-type', 'payload', 'payload.resource', 'payload.originalTopic', 'payload.id', 'payload.submissionPhaseId', 'payload.challengeId', 'payload.memberId', 'payload.url', 'payload.type', 'payload.created'],
    stringFields: ['originator', 'mime-type', 'payload.resource', 'payload.originalTopic', 'payload.url', 'payload.type'],
    integerFields: ['payload.submissionPhaseId', 'payload.challengeId', 'payload.memberId'],
    dateFields: ['timestamp', 'payload.created']
  },
  updateChallengeSubmission: {
    requiredFields: ['originator', 'timestamp', 'mime-type', 'payload', 'payload.resource', 'payload.originalTopic', 'payload.id', 'payload.url'],
    stringFields: ['originator', 'mime-type', 'payload.resource', 'payload.originalTopic', 'payload.url'],
    integerFields: ['payload.legacySubmissionId']
  },
  processReviewSummation: {
    requiredFields: ['id', 'submissionId', 'aggregateScore'],
    numberFields: ['aggregateScore']
  },
  processReview: {
    requiredFields: ['id', 'submissionId', 'score'],
    stringFields: ['metadata.testType', 'typeId'],
    numberFields: ['score']
  },
  AntivirusScanTypeId: 'cfdbc0cf-6437-434e-8af1-c56f317f2afd'
}
