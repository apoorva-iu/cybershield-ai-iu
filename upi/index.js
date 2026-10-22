'use strict';

const config = require('./config');
const parser = require('./parser');
const prompts = require('./prompts');
const validator = require('./validator');
const ai = require('./ai');
const vision = require('./vision');
const scoring = require('./scoring');
const checker = require('./checker');
const routes = require('./routes');

module.exports = {
  createUpiRouter: routes,
  ...config,
  ...parser,
  ...prompts,
  ...validator,
  ...ai,
  ...vision,
  ...scoring,
  ...checker
};
