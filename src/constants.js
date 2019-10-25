/**
 * constants
 */

const resources = {
  submission: 'submission',
  review: 'review',
  reviewSummation: 'reviewSummation'
}

const submissionTypes = {
  'Contest Submission': { id: 1, roleId: 1 },
  'Specification Submission': { id: 2, roleId: 17 },
  'Checkpoint Submission': { id: 3, roleId: 1 },
  'Studio Final Fix Submission': { id: 4, roleId: 1 }
}

const uploadTypes = {
  Submission: 1,
  'Final Fix': 3
}

const phaseTypes = {
  Submission: 2,
  'Final Fix': 9,
  'Specification Submission': 13
}

const uploadStatus = {
  Active: 1,
  Deleted: 2
}

const submissionStatus = {
  Active: 1,
  Deleted: 5
}

module.exports = {
  resources,
  submissionTypes,
  uploadTypes,
  phaseTypes,
  uploadStatus,
  submissionStatus
}
