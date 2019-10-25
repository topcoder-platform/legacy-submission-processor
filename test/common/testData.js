module.exports = {
  createChallengeSubmission: {
    requiredFields: ['originator', 'timestamp', 'mime-type', 'payload', 'payload.resource', 'payload.originalTopic', 'payload.id', 'payload.submissionPhaseId', 'payload.challengeId', 'payload.memberId', 'payload.url', 'payload.type', 'payload.created'],
    stringFields: ['originator', 'mime-type', 'payload.resource', 'payload.originalTopic', 'payload.url', 'payload.type'],
    integerFields: ['payload.submissionPhaseId', 'payload.challengeId', 'payload.memberId'],
    dateFields: ['timestamp', 'payload.created']
  }
}
