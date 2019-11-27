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

  // Query componentStateId
  const componentStateId = _.get(await getMMChallengeProperties(
    connection,
    challengeId,
    userId
  ), 'long_component_state_id')

  if (!componentStateId) {
    throw new Error(`MM component state not found, challengeId: ${challengeId}, userId: ${userId}`)
  }

  logger.debug(`Get componentStateId: ${componentStateId}`)

  // Query submission number
  const result = await connection.queryAsync(
    util.format(GET_SUBMISSION_NUMBER_QUERY, challengeId, phaseId, userId,
      constants.submissionTypes[submissionType].roleId, submissionId))

  const submissionNumber = _.get(result[0], 'submissionnumber')

  logger.debug(`Get submission number: ${submissionNumber}`)

  // Update the initial_score in submission table
  let query = await prepare(connection, UPDATE_SUBMISSION_INITIAL_REVIEW_SCORE_QUERY)
  await query.executeAsync([reviewScore, submissionId])

  // Update the submission_points in informixoltp:long_submission table
  query = await prepare(connection, UPDATE_LONG_SUBMISSION_SCORE_QUERY)
  await query.executeAsync([reviewScore, componentStateId, submissionNumber])

  // Update the points in informixoltp:long_component_state table
  query = await prepare(connection, UPDATE_LONG_COMPONENT_STATE_POINTS_QUERY)
  await query.executeAsync([reviewScore, componentStateId])
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

  // Query roundId and ratedInd
  const challengeProperties = await getMMChallengeProperties(connection, challengeId, userId)
  let [roundId, ratedInd] = [_.get(challengeProperties, 'round_id'), _.get(challengeProperties, 'rated_ind')]

  if (!roundId) {
    throw new Error(`MM round not found, challengeId: ${challengeId}, userId: ${userId}`)
  }

  logger.debug(`Get roundId: ${roundId}`)

  // Update the final_score in submission table
  let query = await prepare(connection, UPDATE_SUBMISSION_FINAL_REVIEW_SCORE_QUERY)
  await query.executeAsync([finalScore, submissionId])

  // Get initial_score from submission table
  let result = await connection.queryAsync(util.format(GET_SUBMISSION_INITIAL_SCORE_QUERY, submissionId))
  const initialScore = _.get(result[0], 'initial_score')

  // Check whether user result exists in informixoltp:long_comp_result
  result = await connection.queryAsync(util.format(CHECK_COMP_RESULT_EXISTS_QUERY, roundId, userId))

  const resultExists = Number(result[0].count) > 0

  ratedInd = ratedInd ? 1 : 0
  const params = {
    roundId: Number(roundId),
    userId,
    initialScore: _.isFinite(Number(initialScore)) ? initialScore : 0,
    finalScore,
    ratedInd
  }

  let userLastCompResult
  if (ratedInd) {
    // The match is rated.
    // Find user's last entry from informixoltp:long_comp_result
    logger.debug('Rated Match - Get previous Rating and Vol')
    const userLastCompResultArr = await connection.queryAsync(
      util.format(GET_LAST_COMP_RESULT_QUERY, roundId, userId)
    )

    if (_.isArray(userLastCompResultArr) && userLastCompResultArr.length) {
      userLastCompResult = userLastCompResultArr[0]
    }
    logger.debug(`Old Rating and Vol values ${userLastCompResult}`)
  }

  if (userLastCompResult) {
    params.oldRating = _.isFinite(userLastCompResult[0]) ? userLastCompResult[0] : null
    params.oldVol = _.isFinite(userLastCompResult[1]) ? userLastCompResult[1] : null
  } else {
    params.oldRating = null
    params.oldVol = null
  }

  if (resultExists) {
    logger.debug(`Update long_comp_result with params: ${JSON.stringify(params)}`)
    // Update the long_comp_result table
    query = await prepare(connection, UPDATE_COMP_RESULT_SCORE_QUERY)
    await query.executeAsync(
      [params.initialScore, params.finalScore, params.oldRating, params.oldVol,
        params.ratedInd, params.roundId, params.userId])
  } else {
    // Add entry in long_comp_result table
    logger.debug(`Insert into long_comp_result with params: ${JSON.stringify(params)}`)
    await insertRecord(connection, 'informixoltp:long_comp_result', {
      round_id: params.roundId,
      coder_id: params.userId,
      point_total: params.initialScore,
      attended: 'N',
      placed: 0,
      advanced: 'N',
      system_point_total: params.finalScore,
      old_rating: params.oldRating,
      old_vol: params.oldVol,
      rated_ind: params.ratedInd
    })
  }

  // Update placed
  result = await connection.queryAsync(util.format(GET_COMP_RESULT_QUERY, roundId))
  query = await prepare(connection, UPDATE_COMP_RESULT_PLACE_QUERY)
  for (let i = 1; i <= result.length; i++) {
    const r = result[i - 1]
    if (i !== r[1]) {
      await query.executeAsync([i, roundId, r.coder_id])
    }
  }
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
