const prisma  = require('../config/prisma');
const { generateSchedule } = require('../services/timetable.service');

// ── Helper: join subject/faculty names onto lecture records ─────────────────
async function enrichLectures(timetables) {
  const subjectCodes = new Set();
  const facultyIds   = new Set();

  for (const tt of timetables) {
    for (const slot of tt.time_details) {
      for (const lec of slot.batch_subjects) {
        if (lec.subjectCode) subjectCodes.add(lec.subjectCode);
        if (lec.facultyid)   facultyIds.add(Number(lec.facultyid));
      }
    }
  }

  const [subjects, faculty] = await Promise.all([
    prisma.subject.findMany({
      where: { subject_code: { in: [...subjectCodes] } },
      select: { subject_code: true, subject_name: true },
    }),
    prisma.faculty.findMany({
      where: { faculty_id: { in: [...facultyIds] } },
      select: { faculty_id: true, name: true },
    }),
  ]);

  const subjectMap = Object.fromEntries(subjects.map((s) => [s.subject_code, s.subject_name]));
  const facultyMap = Object.fromEntries(faculty.map((f)  => [f.faculty_id,   f.name]));

  return { subjectMap, facultyMap };
}

// ── Serialize BigInt fields + join names ────────────────────────────────────
function serializeTimetables(timetables, subjectMap, facultyMap) {
  return timetables.map((tt) => ({
    id:          Number(tt.id),
    dateOfWeek:  tt.dateOfWeek,
    branch_id:   tt.branch_id,
    sem:         tt.sem,
    division:    tt.division,
    academic_id: tt.academic_id,
    fromDate:    tt.fromDate,
    toDate:      tt.toDate,
    slots: tt.time_details.map((slot) => ({
      id:               Number(slot.id),
      timetable_id:     Number(slot.timetable_id),
      startTimeHr:      slot.startTimeHr,
      startTimeMinutes: slot.startTimeMinutes,
      endTimeHr:        slot.endTimeHr,
      endTimeMinutes:   slot.endTimeMinutes,
      lectures: slot.batch_subjects.map((lec) => ({
        id:                     Number(lec.id),
        time_table_detailed_id: Number(lec.time_table_detailed_id),
        typeOfLecture:          lec.typeOfLecture,
        subjectCode:            lec.subjectCode,
        subject_name:           lec.subjectCode ? (subjectMap[lec.subjectCode] || null) : null,
        facultyid:              lec.facultyid ? Number(lec.facultyid) : null,
        faculty_name:           lec.facultyid ? (facultyMap[Number(lec.facultyid)] || null) : null,
        batch:                  lec.batch,
        room_number:            lec.room_number,
        is_extra:               lec.is_extra,
        lect_on_dehalf:         lec.lect_on_dehalf ? Number(lec.lect_on_dehalf) : null,
        reason:                 lec.reason,
      })),
    })),
  }));
}

const INCLUDE_FULL = {
  time_details: {
    include: {
      batch_subjects: true,
    },
    orderBy: [{ startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
  },
};

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ── GET /api/timetable/weekly ────────────────────────────────────────────────
const getWeekly = async (req, res) => {
  try {
    const { branchId, sem, division } = req.query;
    const where = {};
    if (branchId) where.branch_id = parseInt(branchId);
    if (sem)      where.sem       = sem.toString();
    if (division) where.division  = division;

    const timetables = await prisma.tblTimeTable.findMany({
      where,
      include: INCLUDE_FULL,
    });

    timetables.sort((a, b) => DAYS_ORDER.indexOf(a.dateOfWeek) - DAYS_ORDER.indexOf(b.dateOfWeek));
    const { subjectMap, facultyMap } = await enrichLectures(timetables);

    return res.json({ success: true, data: serializeTimetables(timetables, subjectMap, facultyMap) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/today ─────────────────────────────────────────────────
const getToday = async (req, res) => {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  req.query.dateOfWeek = DAYS[new Date().getDay()];

  try {
    const { branchId, sem, division } = req.query;
    const where = {};
    if (branchId)              where.branch_id = parseInt(branchId);
    if (sem)                   where.sem       = sem.toString();
    if (division)              where.division  = division;
    if (req.query.dateOfWeek)  where.dateOfWeek = req.query.dateOfWeek;

    const timetables = await prisma.tblTimeTable.findMany({ where, include: INCLUDE_FULL });
    const { subjectMap, facultyMap } = await enrichLectures(timetables);

    return res.json({ success: true, data: serializeTimetables(timetables, subjectMap, facultyMap) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/faculty/:facultyId ────────────────────────────────────
const getFacultyTimetable = async (req, res) => {
  try {
    const facultyId = BigInt(req.params.facultyId);

    // Find all batch_subjects for this faculty, join through slots to timetable
    const lectures = await prisma.timeTableBatchSubject.findMany({
      where: { facultyid: facultyId },
      include: {
        time_slot: {
          include: { timetable: true },
        },
      },
    });

    // Build a day-grouped structure
    const dayMap = {};
    for (const lec of lectures) {
      const tt   = lec.time_slot?.timetable;
      const day  = tt?.dateOfWeek || 'Unknown';
      if (!dayMap[day]) dayMap[day] = { timetable: tt, slots: {} };
      const slotId = lec.time_table_detailed_id ? Number(lec.time_table_detailed_id) : 0;
      if (!dayMap[day].slots[slotId]) {
        dayMap[day].slots[slotId] = { slot: lec.time_slot, lectures: [] };
      }
      dayMap[day].slots[slotId].lectures.push(lec);
    }

    return res.json({ success: true, data: dayMap });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/all ───────────────────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const timetables = await prisma.tblTimeTable.findMany({ include: INCLUDE_FULL });
    const { subjectMap, facultyMap } = await enrichLectures(timetables);
    return res.json({ success: true, data: serializeTimetables(timetables, subjectMap, facultyMap) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/slots ─────────────────────────────────────────────────
const getSlots = async (req, res) => {
  try {
    const slots = await prisma.timeTimeDetailed.findMany({
      orderBy: [{ startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
    });
    return res.json({ success: true, data: slots.map((s) => ({ ...s, id: Number(s.id), timetable_id: s.timetable_id ? Number(s.timetable_id) : null })) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/timetable/generate ─────────────────────────────────────────────
const generate = async (req, res) => {
  try {
    // Accept both camelCase and snake_case field names from frontend
    const branchId     = req.body.branchId     || req.body.branch_id;
    const sem          = req.body.sem          || req.body.semester;
    const division     = req.body.division;
    const academicYear = req.body.academicYear || req.body.academic_year;

    if (!branchId || !sem || !division) {
      return res.status(400).json({ success: false, message: 'branchId, sem, and division are required' });
    }

    const result = await generateSchedule({
      branchId,
      sem,
      division,
      academicYear,
      createdBy: req.user.uid,
    });

    return res.json({
      success: true,
      message: `Timetable generated for ${division} – Sem ${sem}`,
      data: result,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/timetable/slots/:id ─────────────────────────────────────────────
const updateSlot = async (req, res) => {
  try {
    const id = BigInt(req.params.id);
    const { subjectCode, facultyid, typeOfLecture, room_number, batch, is_extra, reason } = req.body;

    const data = {};
    if (subjectCode   !== undefined) data.subjectCode   = subjectCode;
    if (facultyid     !== undefined) data.facultyid     = BigInt(facultyid);
    if (typeOfLecture !== undefined) data.typeOfLecture = typeOfLecture;
    if (room_number   !== undefined) data.room_number   = room_number;
    if (batch         !== undefined) data.batch         = batch;
    if (is_extra      !== undefined) data.is_extra      = parseInt(is_extra);
    if (reason        !== undefined) data.reason        = reason;

    const slot = await prisma.timeTableBatchSubject.update({ where: { id }, data });

    return res.json({
      success: true,
      data: { ...slot, id: Number(slot.id), facultyid: slot.facultyid ? Number(slot.facultyid) : null },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getWeekly, getToday, getFacultyTimetable, getAll, getSlots, generate, updateSlot };
