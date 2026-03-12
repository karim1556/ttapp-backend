const { Router } = require('express');
const ctrl = require('../controllers/timetable.controller');
const auth = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');

const router = Router();
router.use(auth);

router.get('/weekly',          ctrl.getWeekly);
router.get('/today',           ctrl.getToday);
router.get('/all',             ctrl.getAll);
router.get('/slots',           ctrl.getSlots);
router.get('/faculty/:facultyId', ctrl.getFacultyTimetable);
router.post('/generate',       requireAdmin, ctrl.generate);
router.put('/slots/:id',       requireAdmin, ctrl.updateSlot);

module.exports = router;
