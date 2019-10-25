# Topcoder - Legacy Submission Processor

## Verification

start Kafka server, start informix database(Make sure you have already executed `docker-ifx/update.sql` script to insert test data), start mock api server and start the processor

1. start kafka-console-producer to write messages to `challenge.notification.create` topic:
  `bin/kafka-console-producer.sh --broker-list localhost:9092 --topic submission.notification.aggregate`
2. write message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": 111, "originalTopic": "submission.notification.create", "challengeId": 30005521, "memberId": 124916, "resource": "submission", "url": "http://content.topcoder.com/some/path", "type": "Contest Submission", "submissionPhaseId": 95245, "created": "2018-02-16T00:00:00" } }`
3. Check the app console, it will show the success message.
4. check the database using following sql script:

    ```bash
    database tcs_catalog;
    select * from resource_submission;
    select * from submission;
    select * from upload;
    ```

5. Clear the database using following sql script:

    ```bash
    database tcs_catalog;
    delete from resource_submission;
    delete from submission;
    delete from upload;
    ```

6. write message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": 112, "originalTopic": "submission.notification.create", "challengeId": 30005530, "memberId": 124764, "resource": "submission", "url": "http://content.topcoder.com/some/path", "type": "Contest Submission", "submissionPhaseId": 95284, "created": "2018-02-16T00:00:00" } }`

7. check the app console, it will show success message.
8. repeat step 5 and step 6 to verify and clear database
9. writ message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": 114, "originalTopic": "submission.notification.create", "challengeId": 30005540, "memberId": 132458, "resource": "submission", "url": "http://content.topcoder.com/some/path", "type": "Contest Submission", "submissionPhaseId": 95308, "created": "2018-02-16T00:00:00" } }`
10. check the app console, it will show success message.
11. repeat step 5 and step 6 to verify and clear database(Only upload table has record)
12. write message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": 113, "originalTopic": "submission.notification.create", "challengeId": 30005530, "memberId": 132458, "resource": "submission", "url": "http://content.topcoder.com/some/path", "type": "Contest Submission", "submissionPhaseId": 95308, "created": "2018-02-16T00:00:00" } }`
13. check the app console, it will show failure message.

## Unit test Coverage

  34 passing (4s)

File                  |  % Stmts | % Branch |  % Funcs |  % Lines | Uncovered Line #s
----------------------|----------|----------|----------|----------|-------------------
All files             |    90.95 |    82.95 |     96.3 |    90.82 |
 config               |      100 |    93.48 |      100 |      100 |
  default.js          |      100 |    93.48 |      100 |      100 |           8,31,42
  test.js             |      100 |      100 |      100 |      100 |
 src                  |      100 |      100 |      100 |      100 |
  bootstrap.js        |      100 |      100 |      100 |      100 |
  constants.js        |      100 |      100 |      100 |      100 |
 src/common           |       85 |       60 |    94.74 |       85 |
  IdGenerator.js      |       80 |       75 |      100 |       80 |... 80,81,95,96,97
  helper.js           |    69.23 |        0 |       50 |    69.23 |       35,36,37,39
  logger.js           |    91.04 |    68.18 |      100 |    91.04 |33,56,61,85,99,119
 src/services         |      100 |      100 |      100 |      100 |
  ProcessorService.js |      100 |      100 |      100 |      100 |

## E2E test Coverage

  37 passing (1m)

File                  |  % Stmts | % Branch |  % Funcs |  % Lines | Uncovered Line #s
----------------------|----------|----------|----------|----------|-------------------
All files             |       93 |    84.38 |    97.14 |    92.89 |
 config               |      100 |    93.48 |      100 |      100 |
  default.js          |      100 |    93.48 |      100 |      100 |           8,31,42
  test.js             |      100 |      100 |      100 |      100 |
 src                  |    96.72 |     62.5 |    90.91 |    96.49 |
  app.js              |    95.45 |     62.5 |     87.5 |    95.35 |             56,81
  bootstrap.js        |      100 |      100 |      100 |      100 |
  constants.js        |      100 |      100 |      100 |      100 |
 src/common           |     87.5 |       70 |      100 |     87.5 |
  IdGenerator.js      |       80 |       75 |      100 |       80 |... 80,81,95,96,97
  helper.js           |    92.31 |       50 |      100 |    92.31 |                37
  logger.js           |    91.04 |    72.73 |      100 |    91.04 |33,56,61,85,99,119
 src/services         |      100 |      100 |      100 |      100 |
  ProcessorService.js |      100 |      100 |      100 |      100 |
