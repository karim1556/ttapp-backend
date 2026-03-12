const { Router } = require('express');
const ctrl = require('../controllers/notification.controller');
const auth = require('../middleware/auth.middleware');

const router = Router();
router.use(auth);

router.post('/token', ctrl.saveToken);

module.exports = router;
