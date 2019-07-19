/* eslint-disable no-unused-vars, no-magic-numbers */
const logger = require('utils/logger.js');

function handleError(error, req, res, next) {
  const statusCode = error.statusCode || 500;
  const route = req.url || '';

  logger.error(error.message, route, error.stack);

  // log the internal error if one exists
  if (error.error) {
    logger.error(error.error, route, error.stack);
  }

  res.status(statusCode).json(error.message);
}

module.exports = handleError;
