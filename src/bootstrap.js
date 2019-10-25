/**
 * Init app
 */

global.Promise = require('bluebird')
const _ = require('lodash')
const Joi = require('@hapi/joi')
const constants = require('./constants')

Joi.id = () => Joi.number().integer().positive() // positive integer id
Joi.sid = () => Joi.alternatives().try(Joi.id(), Joi.string().uuid()) // string id or positive integer id
// valid resource enum
Joi.resource = () => Joi.string().valid(_.keys(constants.resources)).required()
