const prisma = require('../config/prisma');

// Normalize ispractical/isoral to 0/1 for Flutter compat
const normalize = (s) => ({
  ...s,
  isPractical:     s.ispractical === 'Yes' ? 1 : 0,
  isOral:          s.isoral === 'Yes' ? 1 : 0,
  totalCredits:    s.totalcredits,
  professorAssign: s.professor_assign,
});

// ── GET /api/subjects ────────────────────────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const { branchId, semester, acadYear } = req.query;
    const where = {};
    if (branchId)  where.branch_id = parseInt(branchId);
    if (semester)  where.semester  = parseInt(semester);
    if (acadYear)  where.acad_year = acadYear;

    const subjects = await prisma.subject.findMany({
      where,
      orderBy: [{ semester: 'asc' }, { subject_name: 'asc' }],
    });

    return res.json({ success: true, data: subjects.map(normalize) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/subjects ───────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const {
      subjectName, subjectCode, semester, totalCredits,
      isPractical, isOral, branchId, acadYear,
      professorAssign, professor_assign,
      maxMarks, max_marks,
      oralMarks, oral_marks,
      practicalMarks, practical_marks,
      passingMarks, passing_marks,
      numModules, num_modules,
      numExperiments, num_experiments,
      numAssignments, num_assignments,
      experiments, theory,
    } = req.body;

    const subject = await prisma.subject.create({
      data: {
        subject_name:    subjectName,
        subject_code:    subjectCode,
        semester:        semester       ? parseInt(semester)        : null,
        totalcredits:    totalCredits   ? parseFloat(totalCredits)  : null,
        ispractical:     (isPractical  === 1 || isPractical  === '1'  || isPractical  === true) ? 'Yes' : 'No',
        isoral:          (isOral       === 1 || isOral       === '1'  || isOral       === true) ? 'Yes' : 'No',
        branch_id:       branchId      ? parseInt(branchId)        : null,
        acad_year:       acadYear      || null,
        professor_assign: professorAssign || professor_assign || null,
        max_marks:       (maxMarks ?? max_marks)             ? parseInt(maxMarks ?? max_marks) : 0,
        oral_marks:      (oralMarks ?? oral_marks)           ? parseInt(oralMarks ?? oral_marks) : 0,
        practical_marks: (practicalMarks ?? practical_marks)  ? parseInt(practicalMarks ?? practical_marks) : 0,
        passing_marks:   (passingMarks ?? passing_marks)      ? parseInt(passingMarks ?? passing_marks) : null,
        num_modules:     (numModules ?? num_modules)          ? parseInt(numModules ?? num_modules) : null,
        num_experiments: (numExperiments ?? num_experiments)   ? parseInt(numExperiments ?? num_experiments) : null,
        num_assignments: (numAssignments ?? num_assignments)   ? parseInt(numAssignments ?? num_assignments) : null,
        experiments:     experiments ?? null,
        theory:          theory       ?? null,
      },
    });

    return res.status(201).json({ success: true, data: normalize(subject) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/subjects/:id ────────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      subjectName, subjectCode, semester, totalCredits,
      isPractical, isOral, branchId, acadYear,
      professorAssign, professor_assign,
      maxMarks, max_marks,
      oralMarks, oral_marks,
      practicalMarks, practical_marks,
      passingMarks, passing_marks,
      numModules, num_modules,
      numExperiments, num_experiments,
      numAssignments, num_assignments,
      experiments, theory,
    } = req.body;

    const data = {};
    if (subjectName  !== undefined) data.subject_name = subjectName;
    if (subjectCode  !== undefined) data.subject_code = subjectCode;
    if (semester     !== undefined) data.semester     = parseInt(semester);
    if (totalCredits !== undefined) data.totalcredits = parseFloat(totalCredits);
    if (isPractical  !== undefined) data.ispractical  = (isPractical === 1 || isPractical === '1' || isPractical === true) ? 'Yes' : 'No';
    if (isOral       !== undefined) data.isoral       = (isOral      === 1 || isOral      === '1' || isOral      === true) ? 'Yes' : 'No';
    if (branchId     !== undefined) data.branch_id    = parseInt(branchId);
    if (acadYear     !== undefined) data.acad_year    = acadYear;
    const profAssign = professorAssign ?? professor_assign;
    if (profAssign   !== undefined) data.professor_assign = profAssign;
    const mMarks = maxMarks ?? max_marks;
    if (mMarks       !== undefined) data.max_marks    = parseInt(mMarks);
    const oMarks = oralMarks ?? oral_marks;
    if (oMarks       !== undefined) data.oral_marks   = parseInt(oMarks);
    const pMarks = practicalMarks ?? practical_marks;
    if (pMarks       !== undefined) data.practical_marks = parseInt(pMarks);
    const passMarks = passingMarks ?? passing_marks;
    if (passMarks    !== undefined) data.passing_marks = parseInt(passMarks);
    const nMod = numModules ?? num_modules;
    if (nMod         !== undefined) data.num_modules  = parseInt(nMod);
    const nExp = numExperiments ?? num_experiments;
    if (nExp         !== undefined) data.num_experiments = parseInt(nExp);
    const nAss = numAssignments ?? num_assignments;
    if (nAss         !== undefined) data.num_assignments = parseInt(nAss);
    if (experiments  !== undefined) data.experiments = experiments ?? null;
    if (theory       !== undefined) data.theory       = theory       ?? null;

    const subject = await prisma.subject.update({ where: { id }, data });
    return res.json({ success: true, data: normalize(subject) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/subjects/:id ─────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    await prisma.subject.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true, message: 'Subject deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove };
