/**
 * The default configuration file.
 */

module.exports = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',

  KAFKA_URL: process.env.KAFKA_URL || 'localhost:9092',
  // below are used for secure Kafka connection, they are optional
  // for the local Kafka, they are not needed
  KAFKA_CLIENT_CERT: process.env.KAFKA_CLIENT_CERT,
  KAFKA_CLIENT_CERT_KEY: process.env.KAFKA_CLIENT_CERT_KEY,

  // Kafka group id
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'legacy-submission-processor',
  // Kafka topic to be listened
  KAFKA_AGGREGATE_SUBMISSION_TOPIC: process.env.KAFKA_AGGREGATE_SUBMISSION_TOPIC || 'submission.notification.aggregate',
  // originator of Kafka message to be handled
  INCOMING_KAFKA_ORIGINATOR: process.env.INCOMING_KAFKA_ORIGINATOR || 'submission-api',
  // original topic of submission creation Kafka message
  KAFKA_NEW_SUBMISSION_TOPIC: process.env.KAFKA_NEW_SUBMISSION_TOPIC || 'submission.notification.create',

  // original topic of submission update Kafka message
  KAFKA_UPDATE_SUBMISSION_TOPIC: process.env.KAFKA_UPDATE_SUBMISSION_TOPIC || 'submission.notification.update',

  AUTH0_URL: process.env.AUTH0_URL,
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE,
  TOKEN_CACHE_TIME: process.env.TOKEN_CACHE_TIME,
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,
  AUTH0_PROXY_SERVER_URL: process.env.AUTH0_PROXY_SERVER_URL,

  // The Submission API URL
  SUBMISSION_API_URL: process.env.SUBMISSION_API_URL || 'http://localhost:3001',

  // The Informix Submission Table Sequence Name
  ID_SEQ_SUBMISSION: process.env.ID_SEQ_SUBMISSION || 'submission_id_seq',
  // The Informix Upload Table Sequence Name
  ID_SEQ_UPLOAD: process.env.ID_SEQ_UPLOAD || 'upload_id_seq',

  // informix database configuration
  INFORMIX: {
    SERVER: process.env.IFX_SERVER || 'informixoltp_tcp', // informix server
    DATABASE: process.env.IFX_DATABASE || 'tcs_catalog', // informix database
    HOST: process.env.INFORMIX_HOST || 'localhost', // host
    PROTOCOL: process.env.IFX_PROTOCOL || 'onsoctcp',
    PORT: process.env.IFX_PORT || '2021', // port
    DB_LOCALE: process.env.IFX_DB_LOCALE || 'en_US.57372',
    USER: process.env.IFX_USER || 'informix', // user
    PASSWORD: process.env.IFX_PASSWORD || '1nf0rm1x', // password
    POOL_MAX_SIZE: parseInt(process.env.IFX_POOL_MAX_SIZE) || 10 // use connection pool in processor, the pool size
  }
}
