const { Router } = require('express');
const ctrl = require('../controllers/auth.controller');

const router = Router();

router.post('/login', ctrl.login);

module.exports = router;
