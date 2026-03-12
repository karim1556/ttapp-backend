const { Router } = require('express');
const ctrl = require('../controllers/holiday.controller');
const auth = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');

const router = Router();
router.use(auth);

router.get('/upcoming', ctrl.getUpcoming);
router.get('/',         ctrl.getAll);
router.post('/',        requireAdmin, ctrl.create);
router.put('/:id',      requireAdmin, ctrl.update);
router.delete('/:id',   requireAdmin, ctrl.remove);

module.exports = router;
