/**
 * Contains generic helper methods
 */

const helper = require('../../src/common/helper')

/**
 * Clear test data
 */
async function clearTestData () {
  const connection = await helper.getInformixConnection()
  try {
    await connection.queryAsync('DELETE FROM resource_submission')
    await connection.queryAsync('DELETE FROM submission')
    await connection.queryAsync('DELETE FROM upload')
    await connection.queryAsync('DELETE FROM informixoltp:long_submission')
    await connection.queryAsync('DELETE FROM informixoltp:long_component_state')
  } finally {
    await connection.closeAsync()
  }
}

/**
 * Create test data in the database
 */
async function insertTestData () {
  const connection = await helper.getInformixConnection()

  try {
    await connection.queryAsync(`
    INSERT INTO informix.upload(upload_id, project_id, project_phase_id, resource_id, upload_type_id, upload_status_id, parameter, create_user, create_date, modify_user, modify_date, url)
    VALUES(3001, 30005521, 95245 , 125204, 1, 1, 'N/A', 132456, current, 132456, current, 'http://upload-url1')`)

    await connection.queryAsync(`
    INSERT INTO submission(submission_id, upload_id, submission_status_id, submission_type_id, create_user, create_date, modify_user, modify_date)
    VALUES (2001, 3001, 1, 1, 132456, current, 132456, current)`)

    await connection.queryAsync(`
    INSERT INTO informixoltp:long_component_state(long_component_state_id, round_id, coder_id, component_id, points, status_id, submission_number, example_submission_number)
    VALUES(7000, 2001, 124916, 2001, 87, 130, 1, 0) `)

    await connection.queryAsync(`
    INSERT INTO informix.upload(upload_id, project_id, project_phase_id, resource_id, upload_type_id, upload_status_id, parameter, create_user, create_date, modify_user, modify_date, url)
    VALUES(3000, 30054163, 95245 , 125232, 1, 1, 'N/A', 132456, current, 132456, current, 'http://upload-url1')`)

    await connection.queryAsync(`
    INSERT INTO submission(submission_id, upload_id, submission_status_id, submission_type_id, create_user, create_date, modify_user, modify_date)
    VALUES (2000, 3000, 1, 1, 132456, current, 132456, current)`)

    await connection.queryAsync(`
    INSERT INTO informixoltp:long_submission(long_component_state_id, example, submission_number, language_id)
    VALUES (7000, 0, 1, 1)`)
  } finally {
    await connection.closeAsync()
  }
}

module.exports = {
  clearTestData,
  insertTestData
}
