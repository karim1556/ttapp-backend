const { Router } = require('express');
const ctrl = require('../controllers/timetable.controller');
const auth = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');

const router = Router();
router.use(auth);

router.get('/weekly',          ctrl.getWeekly);
router.get('/room/:roomNumber/weekly', ctrl.getRoomWeekly);
router.get('/reports/classroom-usage', ctrl.getClassroomUsageReport);
router.get('/today',           ctrl.getToday);
router.get('/',                ctrl.getAll);
router.get('/all',             ctrl.getAll);
router.get('/slots',           ctrl.getSlots);
router.get('/faculty/:facultyId', ctrl.getFacultyTimetable);
router.post('/generate',       requireAdmin, ctrl.generate);
router.post('/generate-all',   requireAdmin, ctrl.generateAll);
router.put('/slots/:id',       requireAdmin, ctrl.updateSlot);
router.put('/slots/:id/move',  requireAdmin, ctrl.moveSlot);

module.exports = router;
