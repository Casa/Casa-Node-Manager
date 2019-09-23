/* eslint-disable no-unused-vars, no-magic-numbers */
const constants = require('utils/const.js');

function handleError(error, req, res, next) {

  // If a incorrect password was given for change password, respond with 403 instead of 401.
  if (error.message && error.message === 'Incorrect password') {

    return res.status(constants.STATUS_CODES.FORBIDDEN).json();
  } else {

    return next();
  }

}

module.exports = handleError;
