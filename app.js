require('module-alias/register');
require('module-alias').addPath('.');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const passport = require('passport');
const cors = require('cors');

// Keep requestCorrelationId middleware as the first middleware. Otherwise we risk losing logs.
const requestCorrelationMiddleware = require('middlewares/requestCorrelationId.js'); // eslint-disable-line id-length
const errorHandleMiddleware = require('middlewares/errorHandling.js');
const corsOptions = require('middlewares/cors.js').corsOptions;
require('middlewares/auth.js');

const logger = require('utils/logger.js');
const applicationLogic = require('logic/application.js');

const accounts = require('routes/v1/accounts.js');
const device = require('routes/v1/device.js');
const logs = require('routes/v1/logs.js');
const settings = require('routes/v1/settings.js');
const telemetry = require('routes/v1/telemetry.js');
const ping = require('routes/ping.js');
const app = express();

app.use(cors(corsOptions));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());
app.use(passport.session());

app.use(requestCorrelationMiddleware);
app.use(morgan(logger.morganConfiguration));
app.use('/ping', ping);
app.use('/v1/accounts', accounts);
app.use('/v1/device', device);
app.use('/v1/logs', logs);
app.use('/v1/settings', settings);
app.use('/v1/telemetry', telemetry);

app.use(errorHandleMiddleware);
app.use(function(req, res) {
  res.status(404).json(); // eslint-disable-line no-magic-numbers
});

applicationLogic.startup();

module.exports = app;
