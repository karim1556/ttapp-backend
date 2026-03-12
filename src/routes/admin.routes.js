const { Router } = require('express');
const ctrl = require('../controllers/admin.controller');
const auth = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');

const router = Router();
router.use(auth, requireAdmin);

router.get('/stats', ctrl.getStats);

module.exports = router;
