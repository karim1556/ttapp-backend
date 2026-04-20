const { Router } = require('express');
const ctrl = require('../controllers/substitution.controller');
const auth = require('../middleware/auth.middleware');
const { requireAdmin, requireAdminOrFaculty } = require('../middleware/role.middleware');

const router = Router();
router.use(auth);

router.get('/', requireAdminOrFaculty, ctrl.getAll);
router.post('/preview', requireAdminOrFaculty, ctrl.preview);
router.post('/', requireAdminOrFaculty, ctrl.create);
router.post('/:id/approve', requireAdmin, ctrl.approve);

module.exports = router;
