/**
 * This service provides utility function for accessing data in Informix database.
 */

const _ = require('lodash')
const constants = require('../constants')
const util = require('util')
const logger = require('../common/logger')

// The query to update upload url by submission id
const UPDATE_UPLOAD_URL_QUERY = 'update upload set url = ? where upload_id in ' +
        '(select s.upload_id from submission s, upload uu where uu.upload_id = s.upload_id and s.submission_id = ?)'

// The query to get MM challenge properties
const GET_MMCHALLENGE_PROPERTIES_QUERY = `select rc.round_id, rc.component_id, lcs.long_component_state_id, NVL(lcs.submission_number,0) as submission_number, NVL(lcs.points,0) as points, r.rated_ind
  from project p
  join project_info pi56 on p.project_id = %d and p.project_id = pi56.project_id and pi56.project_info_type_id = 56 and p.project_category_id=37
  join informixoltp:round_component rc on rc.round_id =pi56.value
  join informixoltp:round r on rc.round_id=r.round_id
  left join informixoltp:long_component_state lcs on lcs.coder_id= %d and lcs.round_id = rc.round_id and lcs.component_id = rc.component_id`

// The query to get user's submission number in a challenge
const GET_SUBMISSION_NUMBER_QUERY = `
  select count(*) as submissionNumber
  from submission s, upload u, resource r
  where s.upload_id = u.upload_id and u.resource_id = r.resource_id and u.project_id = r.project_id
  and u.project_id=%d and u.project_phase_id=%d
  and r.user_id=%d and r.resource_role_id=%d
  and s.submission_id <= %d`

// The query to update initial_score in "submission" table
const UPDATE_SUBMISSION_INITIAL_REVIEW_SCORE_QUERY = 'update submission set initial_score=? where submission_id=?'

// The query to update submission_points in "long_submission" table
const UPDATE_LONG_SUBMISSION_SCORE_QUERY = 'update informixoltp:long_submission set submission_points=? where long_component_state_id=? and submission_number=? and example=0'

// The query to update points in "long_component_state" table
const UPDATE_LONG_COMPONENT_STATE_POINTS_QUERY = `update informixoltp:long_component_state set points=?
  where long_component_state_id=?`

// The query to update final_score in "submission" table
const UPDATE_SUBMISSION_FINAL_REVIEW_SCORE_QUERY = 'update submission set final_score=? where submission_id=?'

// The query to get initial_score from "submission" table
const GET_SUBMISSION_INITIAL_SCORE_QUERY = 'select initial_score from submission where submission_id = %d'

// The query to check where user result exists in "long_comp_result" table
const CHECK_COMP_RESULT_EXISTS_QUERY = 'select count(*) as count from informixoltp:long_comp_result where round_id=%d and coder_id=%d'

// The query to get user's last entry from "long_comp_result" table
const GET_LAST_COMP_RESULT_QUERY = 'select first 1 new_rating, new_vol from informixoltp:long_comp_result where round_id < %d and coder_id=%d and rated_ind = 1 order by round_id desc'

// The query to update point_total and system_point_total in "long_comp_result" table
const UPDATE_COMP_RESULT_SCORE_QUERY = `update informixoltp:long_comp_result
  set point_total=?, system_point_total=?, old_rating=?, old_vol=?, rated_ind=? where round_id=? and coder_id=?`

// The query to get result from "long_comp_result" table ordered by scores
const GET_COMP_RESULT_QUERY = 'select coder_id, placed from informixoltp:long_comp_result where round_id=%d order by system_point_total desc, point_total desc'

// The query to update placed in "long_comp_result" table
const UPDATE_COMP_RESULT_PLACE_QUERY = 'update informixoltp:long_comp_result set placed = ? where round_id=? and coder_id=?'

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
 * Updates the upload url for the submission identified by the given submission id.
 *
 * @param {Object} connection The Informix database connection
 * @param {String} url The url to set for the submission upload
 * @param {Integer} submissionId The id of the submission for which to update the upload url
 */
async function updateUploadUrl (connection, url, submissionId) {
  const query = await prepare(connection, UPDATE_UPLOAD_URL_QUERY)
  await query.executeAsync([url, submissionId])
}

/**
 * Updates provisional score for the submission
 *
 * @param {Object} connection The Informix db connection
 * @param {Number} challengeId challenge id
 * @param {Number} userId user id
 * @param {Number} phaseId phase id
 * @param {String} submissionId submission id
 * @param {String} submissionType submission type
 * @param {Number} reviewScore the provisional review score
 */
async function updateProvisionalScore (
  connection,
  challengeId,
  userId,
  phaseId,
  submissionId,
  submissionType,
  reviewScore
) {
  logger.debug(`Update provisional score for submission: ${submissionId}`)

  await getMMChallengeProperties(connection, challengeId, userId)
  const query = await prepare(connection, UPDATE_SUBMISSION_INITIAL_REVIEW_SCORE_QUERY)
  await query.executeAsync([reviewScore, submissionId])

  logger.debug(`Updated provisional score for submission: ${submissionId}`)
}

/**
 * Update final score for MM challenge
 *
 * @param {Object} connection The Informix db connection
 * @param {Number} challengeId challenge id
 * @param {Number} userId user id
 * @param {String} submissionId submission id
 * @param {Number} finalScore the final review score
 */
async function updateFinalScore (connection, challengeId, userId, submissionId, finalScore) {
  logger.debug(`Update final score for submission: ${submissionId}`)

  await getMMChallengeProperties(connection, challengeId, userId)
  const query = await prepare(connection, UPDATE_SUBMISSION_FINAL_REVIEW_SCORE_QUERY)
  await query.executeAsync([finalScore, submissionId])

  logger.debug(`Updated final score for submission: ${submissionId}`)
}

/**
 * Get mm challenge related properties
 *
 * @param {Object} Informix db connectio object
 * @param {Number} challengeId challenge id
 * @param {Number} userId user id
 * @returns {Array} [roundId, componentId, componentStateId, numSubmissions, points, ratedInd]
 */
async function getMMChallengeProperties (connection, challengeId, userId) {
  const result = await connection.queryAsync(util.format(GET_MMCHALLENGE_PROPERTIES_QUERY, challengeId, userId))

  if (!_.isArray(result) || _.isEmpty(result)) {
    throw new Error(
      `null or empty result get mm challenge properties for : challenge id ${challengeId}, user id ${userId}`)
  }
  return result[0]
}

module.exports = {
  insertRecord,
  updateProvisionalScore,
  updateFinalScore,
  getChallengeProperties,
  updateUploadUrl
}
