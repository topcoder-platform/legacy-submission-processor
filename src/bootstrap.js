/**
 * Init app
 */

global.Promise = require('bluebird')
const _ = require('lodash')
const Joi = require('@hapi/joi')
const constants = require('./constants')

Joi.id = () => Joi.number().integer().positive() // positive integer id
Joi.sid = () => Joi.string().uuid() // string id
Joi.idOrUuid = () => Joi.alternatives().try(Joi.id(), Joi.sid()) // id or uuid
// valid resource enum
Joi.resource = () => Joi.string().valid(_.keys(constants.resources)).required()
