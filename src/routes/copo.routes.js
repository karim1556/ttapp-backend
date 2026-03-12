const { Router } = require('express');
const ctrl = require('../controllers/copo.controller');
const auth = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');

const router = Router();
router.use(auth);

// Course mappings
router.get('/',       ctrl.getAll);
router.get('/:id',    ctrl.getOne);
router.post('/',      requireAdmin, ctrl.create);
router.put('/:id',    requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.remove);

// Enrolled users for a course mapping
router.get('/:id/users',              ctrl.getUsers);
router.post('/:id/users',             requireAdmin, ctrl.addUsers);
router.delete('/:id/users/:userId',   requireAdmin, ctrl.removeUser);

module.exports = router;
