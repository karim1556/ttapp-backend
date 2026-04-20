const { Router } = require('express');
const ctrl = require('../controllers/faculty.controller');
const auth = require('../middleware/auth.middleware');
const { requireAdmin, requireFaculty } = require('../middleware/role.middleware');

const router = Router();
router.use(auth);

router.get('/me',        requireFaculty, ctrl.getMe);
router.put('/me/work-hours', requireFaculty, ctrl.updateMyWeeklyWorkHours);
router.get('/',      ctrl.getAll);
router.post('/',     requireAdmin, ctrl.create);
router.put('/:id',   requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.remove);

module.exports = router;
