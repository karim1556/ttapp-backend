const { Router } = require('express');
const ctrl = require('../controllers/constraint.controller');
const auth = require('../middleware/auth.middleware');

const router = Router();
router.use(auth);

router.get('/:facultyId', ctrl.getByFacultyId);
router.post('/',          ctrl.create);
router.put('/:id',        ctrl.update);

module.exports = router;
