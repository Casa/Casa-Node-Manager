const express = require('express');
const router = express.Router();
const auth = require('middlewares/auth.js');
const applicationLogic = require('logic/application.js');
const authLogic = require('logic/auth.js');
const safeHandler = require('utils/safeHandler');

// Registered does not need auth. This is because the user may not be registered at the time and thus won't always have
// an auth token.
router.get('/registered', safeHandler((req, res) =>
  authLogic.isRegistered()
    .then(registered => res.json(registered))
));

router.post('/register', auth.register, safeHandler((req, res) =>
  authLogic.register(req.user)
    .then(jwt => res.json(jwt))
));

router.post('/login', auth.basic, safeHandler((req, res) =>
  applicationLogic.login(req.user)
    .then(jwt => res.json(jwt))
));

router.post('/refresh', auth.jwt, safeHandler((req, res) =>
  applicationLogic.refresh(req.user)
    .then(jwt => res.json(jwt))
));

module.exports = router;
