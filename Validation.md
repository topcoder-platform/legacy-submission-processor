# Topcoder - Legacy Submission Processor

## Verification

start Kafka server, start informix database(Make sure you have already executed `docker-ifx/update.sql` script to insert test data), start mock api server and start the processor

1. start kafka-console-producer to write messages to `challenge.notification.aggregate` topic:
  `bin/kafka-console-producer.sh --broker-list localhost:9092 --topic submission.notification.aggregate`
2. write message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": "cfdbc0cf-6445-433e-8af1-c56f317f2eed", "originalTopic": "submission.notification.create", "challengeId": 30005521, "memberId": 124916, "resource": "submission", "url": "http://content.topcoder.com/some/path", "type": "Contest Submission", "submissionPhaseId": 95245, "created": "2018-02-16T00:00:00" } }`
3. Check the app console, it will show the success message.
4. check the database using following sql script:

    ```bash
    database tcs_catalog;
    select * from resource_submission;
    select * from submission;
    select * from upload;
    ```

5. write message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": "cfdbc0cf-6440-433e-8af1-c56f317f2afd", "originalTopic": "submission.notification.create", "challengeId": 30005530, "memberId": 124764, "resource": "submission", "url": "http://content.topcoder.com/some/path", "type": "Contest Submission", "submissionPhaseId": 95284, "created": "2018-02-16T00:00:00" } }`

6. check the app console, it will show success message.
7. repeat step 4 verify the database.
8. write message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": "cfdbc0cf-6441-433e-8af1-c56f317f2afd", "originalTopic": "submission.notification.create", "challengeId": 30005540, "memberId": 132458, "resource": "submission", "url": "http://content.topcoder.com/some/path", "type": "Contest Submission", "submissionPhaseId": 95308, "created": "2018-02-16T00:00:00" } }`
9. check the app console, it will show success message.
10. repeat step 4 to verify the database(Only upload table has an additional record after step 8)
11. write message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": "cfdbc0cf-6442-433e-8af1-c56f317f2afd", "originalTopic": "submission.notification.create", "challengeId": 30005530, "memberId": 132458, "resource": "submission", "url": "http://content.topcoder.com/some/path", "type": "Contest Submission", "submissionPhaseId": 95308, "created": "2018-02-16T00:00:00" } }`
12. check the app console, it will show failure message.

13. connect to the database tcs_catalog and execute the following statement :

    ```sql
    select url from upload where upload_id = 3000;
    ```

    note the down the url value.

14. write the the following message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": "cfdbc0cf-6445-433e-8af1-c56f317f2afd", "originalTopic": "submission.notification.update", "challengeId": 30005521, "legacySubmissionId": 2000 , "memberId": 124916, "resource": "submission", "url": "http://content.topcoder.com/some/path1", "type": "Contest Submission", "submissionPhaseId": 95245, "created": "2018-02-16T00:00:00" } }`

15. The processor console will show a skipped message `Skipped message for resource submission and originalTopic submission.notification.update`

16. write the following message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": "cfdbc0cf-6443-433e-8af1-c56f317f2afd", "originalTopic": "submission.notification.update", "challengeId": 30005521, "memberId": 124916, "resource": "submission", "url": "http://content.topcoder.com/some/path2", "type": "Contest Submission", "submissionPhaseId": 95245, "created": "2018-02-16T00:00:00" } }`

    The following message will be shown on the processor console:
  `debug: legacy submission id not found / payload url not available, no update performed`

17. Write the following message:
  `{ "topic": "submission.notification.aggregate","originator": "submission-api","timestamp": "2019-10-08T00:00:00.000Z","mime-type": "application/json","payload": { "id": "cfdbc0cf-6445-433e-8af1-c56f317f2afd", "originalTopic": "submission.notification.update", "challengeId": 30005521, "memberId": 124916, "resource": "submission", "url": "http://content.topcoder.com/some/path3", "type": "Contest Submission", "submissionPhaseId": 95245, "created": "2018-02-16T00:00:00" } }`

    The following success message will be shown on the processor console :
  `debug: Updated submission : id cfdbc0cf-6445-433e-8af1-c56f317f2afd, url http://content.topcoder.com/some/path3, legacySubmissionId 2001`

    Check the upload table in tcs_catalog by executing the following statement:

    ```sql
    select url from upload where upload_id = 3001;
    ```

    The url value should be updated to the one sent on the previous message.

18. Write the following message:
  `{"topic":"submission.notification.aggregate","originator":"submission-api","timestamp":"2019-10-08T00:00:00.000Z","mime-type":"application/json","payload":{"id":"cfdbc0cf-8543-433e-8af1-c56f317f2afd","resource":"review","submissionId":"cfdbc0cf-6443-433e-8af1-c56f317f2afd","typeId":"bcf2b43b-20df-44d1-afd3-7fc9798dfcae","score":90.2,"metadata":{"testType":"final","testCases":["DPK.CP001_A549_24H_X1_B42","LITMUS.KD017_A549_96H_X1_B42"]}}}`

    This message testType is not 'provisional', then it should be skipped by the processor and show the following message in the console:
  `debug: Skipped non provisional test type: final`

19. Write an Antivirus scan review, it should be skipped as well :
  `{"topic":"submission.notification.aggregate","originator":"submission-api","timestamp":"2019-10-08T00:00:00.000Z","mime-type":"application/json","payload":{"id":"cfdbc0cf-8543-433e-8af1-c56f317f2afd","resource":"review","submissionId":"cfdbc0cf-6443-433e-8af1-c56f317f2afd","typeId":"cfdbc0cf-6437-434e-8af1-c56f317f2afd","score":90.2,"metadata":{"testType":"provisional","testCases":["DPK.CP001_A549_24H_X1_B42","LITMUS.KD017_A549_96H_X1_B42"]}}}`

20. Write a message for provisional review, but the submission does not have the legacySubmissionId:
    `{"topic":"submission.notification.aggregate","originator":"submission-api","timestamp":"2019-10-08T00:00:00.000Z","mime-type":"application/json","payload":{"id":"cfdbc0cf-8543-433e-8af1-c56f317f2afd","resource":"review","submissionId":"cfdbc0cf-6443-433e-8af1-c56f317f2afd","typeId":"bcf2b43b-20df-44d1-afd3-7fc9798dfcae","score":90.2,"metadata":{"testType":"provisional","testCases":["DPK.CP001_A549_24H_X1_B42","LITMUS.KD017_A549_96H_X1_B42"]}}}`

    The following error should be shown on the console:
  `Error: legacySubmissionId not found for submission: cfdbc0cf-6443-433e-8af1-c56f317f2afd`

21. Write message for provisional review with all needed fields provided :
    Check first the database by executing the following statements:

    ```sql
    select initial_score from submission where submission_id = 2000;

    select submission_points from informixoltp:long_submission
    where long_component_state_id=7000 and submission_number=1 and example=0;

    select points from informixoltp:long_component_state
    where long_component_state_id=7000;
    ```

    `{"topic":"submission.notification.aggregate","originator":"submission-api","timestamp":"2019-10-08T00:00:00.000Z","mime-type":"application/json","payload":{"id":"cfdbc0cf-8543-433e-8af1-c56f317f2afd","resource":"review","submissionId":"cfdbc0cf-6444-433e-8af1-c56f317f2afd","typeId":"bcf2b43b-20df-44d1-afd3-7fc9798dfcae","score":90.2,"metadata":{"testType":"provisional","testCases":["DPK.CP001_A549_24H_X1_B42","LITMUS.KD017_A549_96H_X1_B42"]}}}`

    success message should be shown on the console `debug: Update provisional score for submission: 2000`
    And the database should be updated, check it by executing the SQL statements above.

22. Write message for review summation with no legacy submission id
  `{"topic":"submission.notification.aggregate","originator":"submission-api","timestamp":"2019-10-08T00:00:00.000Z","mime-type":"application/json","payload":{"id":"cfdbc0cf-8543-433e-8af1-c56f317f2afd","resource":"reviewSummation","submissionId":"cfdbc0cf-6443-433e-8af1-c56f317f2afd","aggregateScore":97.5,"metadata":{"testType":"final","testCases":["DPK.CP001_A549_24H_X1_B42","LITMUS.KD017_A549_96H_X1_B42"]}}}`

    The following error should be shown: `Error: legacySubmissionId not found for submission: cfdbc0cf-6443-433e-8af1-c56f317f2afd`

23. Write valid review summation message. First, check the database with the following SQL statements:

    ```sql
    select final_score, initial_score from submission where submission_id = 2000;

    select * from informixoltp:long_comp_result;
    ```

`{"topic":"submission.notification.aggregate","originator":"submission-api","timestamp":"2019-10-08T00:00:00.000Z","mime-type":"application/json","payload":{"id":"cfdbc0cf-8543-433e-8af1-c56f317f2afd","resource":"reviewSummation","submissionId":"cfdbc0cf-6444-433e-8af1-c56f317f2afd","aggregateScore":99.11,"metadata":{"testType":"final","testCases":["DPK.CP001_A549_24H_X1_B42","LITMUS.KD017_A549_96H_X1_B42"]}}}`

There should be a success message and the database should be updated, double-check the database using the SQL statements above.
