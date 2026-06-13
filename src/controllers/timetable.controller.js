const prisma  = require('../config/prisma');
const { generateSchedule, generateAllSchedules } = require('../services/timetable.service');

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

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const WEEKLY_WORKING_DAYS = DAYS_ORDER.length;

function normalizeRoomNumber(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function parseBoolean(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === 'no') return false;
  }
  return false;
}

function parseIntSafe(value) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeDivision(value) {
  return String(value || '').trim().toUpperCase();
}

function resolveSemestersFromTermType(termType) {
  const t = String(termType || '').trim().toLowerCase();
  if (t === 'even') return [2, 4, 6, 8];
  if (t === 'odd') return [1, 3, 5, 7];
  return null;
}

function branchLabel(branchId) {
  switch (branchId) {
    case 1:
      return 'CS';
    case 2:
      return 'IT';
    case 3:
      return 'EXTC';
    case 4:
      return 'Mech';
    default:
      return `Branch ${branchId}`;
  }
}

function resolveFacultyId(professorAssign, facultyMap, facultyByName) {
  if (!professorAssign) return null;
  const asInt = parseInt(professorAssign, 10);
  if (!Number.isNaN(asInt) && facultyMap.has(asInt)) return asInt;
  const nameKey = String(professorAssign).toLowerCase().trim();
  return facultyByName.get(nameKey) ?? null;
}

function formatListPreview(items, limit = 5) {
  if (!items.length) return '';
  const preview = items.slice(0, limit).join(', ');
  const suffix = items.length > limit ? ` and ${items.length - limit} more` : '';
  return `${preview}${suffix}`;
}

async function buildClassConfigsForGenerateAll({ branchIds, semesters, divisions, termType }) {
  const parsedBranchIds = Array.isArray(branchIds)
    ? branchIds.map((v) => parseIntSafe(v)).filter((v) => v !== null)
    : [];
  const parsedSemestersInput = Array.isArray(semesters)
    ? semesters.map((v) => parseIntSafe(v)).filter((v) => v !== null)
    : [];

  const termSemesters = resolveSemestersFromTermType(termType) || [];
  let parsedSemesters = parsedSemestersInput;

  if (termSemesters.length) {
    parsedSemesters = parsedSemestersInput.length
      ? parsedSemestersInput.filter((s) => termSemesters.includes(s))
      : termSemesters;

    if (!parsedSemesters.length) {
      parsedSemesters = termSemesters;
    }
  }

  const effectiveDivisions = (Array.isArray(divisions) && divisions.length
    ? divisions
    : ['A', 'B'])
    .map((d) => normalizeDivision(d))
    .filter((d) => ['A', 'B'].includes(d));

  const where = {};
  if (parsedBranchIds.length) where.branch_id = { in: parsedBranchIds };
  if (parsedSemesters.length) where.semester = { in: parsedSemesters };

  const subjectPairs = await prisma.subject.findMany({
    where,
    select: { branch_id: true, semester: true },
    distinct: ['branch_id', 'semester'],
  });

  const configs = [];
  for (const pair of subjectPairs) {
    if (pair.branch_id === null || pair.semester === null) continue;
    for (const division of effectiveDivisions) {
      configs.push({
        branchId: pair.branch_id,
        sem: pair.semester,
        semStr: String(pair.semester),
        division,
      });
    }
  }

  const deduped = new Map();
  for (const config of configs) {
    const key = `${config.branchId}_${config.semStr}_${config.division}`;
    deduped.set(key, config);
  }

  return [...deduped.values()];
}

async function collectGenerationPreflightIssues({ classConfigs }) {
  const issues = [];

  if (!classConfigs.length) {
    issues.push('No class configurations found from subjects. Add subjects before generating.');
    return issues;
  }

  const [timeSlots, rooms, faculty] = await Promise.all([
    prisma.timeSlotTemplate.findMany({
      where: { is_active: 1 },
      orderBy: [{ sort_order: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
    }),
    prisma.room.findMany({ where: { is_active: 1 } }),
    prisma.faculty.findMany({ include: { constraints: true } }),
  ]);

  const uniqueBranchIds = [...new Set(classConfigs.map((c) => c.branchId))];
  for (const bid of uniqueBranchIds) {
    let slotsForBranch = timeSlots.filter((s) => s.branch_id === bid && !s.is_break);
    if (slotsForBranch.length === 0) {
      slotsForBranch = timeSlots.filter((s) => s.branch_id === null && !s.is_break);
    }
    if (slotsForBranch.length === 0) {
      issues.push(`No active teaching time slots found for department ${branchLabel(bid)}. Configure periods in Time Slots.`);
    }
  }

  if (!rooms.length) {
    issues.push('No active rooms found. Add rooms before generation.');
  }

  const activeFaculty = faculty.filter((f) => f.status === null || f.status === 1);
  if (!activeFaculty.length) {
    issues.push('No active teachers found. Add teachers before generation.');
  }

  const facultyMap = new Map();
  const facultyByName = new Map();
  for (const f of activeFaculty) {
    facultyMap.set(f.faculty_id, f);
    if (f.name) facultyByName.set(String(f.name).toLowerCase().trim(), f.faculty_id);
  }

  const uniquePairs = new Map();
  for (const config of classConfigs) {
    uniquePairs.set(`${config.branchId}_${config.semStr}`, {
      branchId: config.branchId,
      sem: config.sem,
      semStr: config.semStr,
    });
  }

  const subjectsByPair = {};
  await Promise.all(
    [...uniquePairs.values()].map(async (pair) => {
      const rows = await prisma.subject.findMany({
        where: { branch_id: pair.branchId, semester: pair.sem },
      });
      subjectsByPair[`${pair.branchId}_${pair.semStr}`] = rows;
    }),
  );

  const missingSubjectsByPair = [];
  const missingCredits = new Set();
  const missingAssignments = new Set();
  const invalidAssignments = new Set();
  const usedFacultyIds = new Set();

  for (const config of classConfigs) {
    const subjects = subjectsByPair[`${config.branchId}_${config.semStr}`] || [];
    if (!subjects.length) {
      const label = `${branchLabel(config.branchId)} Sem ${config.semStr}`;
      missingSubjectsByPair.push(label);
      continue;
    }

    for (const subject of subjects) {
      const hasWeekly = Number(subject.weekly_hours || 0) > 0;
      const hasSemester = Number(subject.semester_hours || 0) > 0;
      const hasCredits = Number(subject.totalcredits || 0) > 0;

      if (!hasWeekly && !hasSemester && !hasCredits) {
        if (subject.subject_code) missingCredits.add(subject.subject_code);
      }

      if (!subject.professor_assign || String(subject.professor_assign).trim().length === 0) {
        if (subject.subject_code) missingAssignments.add(subject.subject_code);
        continue;
      }

      const facultyId = resolveFacultyId(subject.professor_assign, facultyMap, facultyByName);
      if (!facultyId) {
        if (subject.subject_code) invalidAssignments.add(subject.subject_code);
        continue;
      }

      usedFacultyIds.add(facultyId);
    }
  }

  if (missingSubjectsByPair.length) {
    const label = formatListPreview(missingSubjectsByPair, 4);
    issues.push(`No subjects configured for: ${label}. Add subjects before generation.`);
  }

  if (missingCredits.size) {
    issues.push(
      `Set total credits/weekly hours for subjects: ${formatListPreview([...missingCredits])}.`,
    );
  }

  if (missingAssignments.size) {
    issues.push(
      `Assign teacher mapping (Professor Assign) for subjects: ${formatListPreview([...missingAssignments])}.`,
    );
  }

  if (invalidAssignments.size) {
    issues.push(
      `Invalid teacher mapping (Professor Assign) for subjects: ${formatListPreview([...invalidAssignments])}.`,
    );
  }

  if (usedFacultyIds.size) {
    const missingConstraints = [];
    for (const facultyId of usedFacultyIds) {
      const entry = facultyMap.get(facultyId);
      const constraint = entry?.constraints;
      if (!constraint || constraint.max_lectures_per_day <= 0 || constraint.total_lectures_per_week <= 0) {
        if (entry?.name) missingConstraints.push(entry.name);
      }
    }

    if (missingConstraints.length) {
      issues.push(
        `Faculty constraints are missing/invalid for: ${formatListPreview(missingConstraints)}. Configure constraints before generating.`,
      );
    }
  }

  return issues;
}

async function findExistingTimetableClasses({ classConfigs }) {
  if (!classConfigs.length) return [];

  const filters = classConfigs.map((c) => ({
    branch_id: c.branchId,
    sem: c.semStr,
    division: c.division,
  }));

  const existingRows = await prisma.tblTimeTable.findMany({
    where: { OR: filters },
    select: { branch_id: true, sem: true, division: true },
  });

  const deduped = new Map();
  for (const row of existingRows) {
    const branchId = row.branch_id ?? 0;
    const semStr = row.sem ?? '';
    const division = normalizeDivision(row.division);
    const key = `${branchId}_${semStr}_${division}`;
    deduped.set(key, `${branchLabel(branchId)} Sem ${semStr} Div ${division}`);
  }

  return [...deduped.values()];
}

async function findFacultyConflict({
  excludeIds,
  facultyId,
  dayName,
  startTimeHr,
  startTimeMinutes,
}) {
  if (!facultyId || !dayName) return null;

  return prisma.timeTableBatchSubject.findFirst({
    where: {
      id: Array.isArray(excludeIds) && excludeIds.length ? { notIn: excludeIds } : undefined,
      facultyid: facultyId,
      time_slot: {
        is: {
          startTimeHr,
          startTimeMinutes,
          timetable: {
            is: {
              dateOfWeek: dayName,
            },
          },
        },
      },
    },
    select: { id: true },
  });
}

async function findRoomConflict({
  excludeIds,
  roomNumber,
  dayName,
  startTimeHr,
  startTimeMinutes,
}) {
  const normalizedRoom = normalizeRoomNumber(roomNumber);
  if (!normalizedRoom || !dayName) return null;

  return prisma.timeTableBatchSubject.findFirst({
    where: {
      id: Array.isArray(excludeIds) && excludeIds.length ? { notIn: excludeIds } : undefined,
      room_number: normalizedRoom,
      time_slot: {
        is: {
          startTimeHr,
          startTimeMinutes,
          timetable: {
            is: {
              dateOfWeek: dayName,
            },
          },
        },
      },
    },
    select: { id: true },
  });
}

// ── GET /api/timetable/weekly ────────────────────────────────────────────────
const getWeekly = async (req, res) => {
  try {
    const { branchId, sem, division, roomNumber } = req.query;
    const where = { dateOfWeek: { in: DAYS_ORDER } };
    if (branchId) where.branch_id = parseInt(branchId);
    if (sem)      where.sem       = sem.toString();
    if (division) where.division  = division;

    const timetables = await prisma.tblTimeTable.findMany({
      where,
      include: INCLUDE_FULL,
    });

    timetables.sort((a, b) => DAYS_ORDER.indexOf(a.dateOfWeek) - DAYS_ORDER.indexOf(b.dateOfWeek));
    const { subjectMap, facultyMap } = await enrichLectures(timetables);

    let serialized = serializeTimetables(timetables, subjectMap, facultyMap);

    const normalizedRoom = normalizeRoomNumber(roomNumber)?.toLowerCase();
    if (normalizedRoom) {
      serialized = serialized.map((day) => ({
        ...day,
        slots: day.slots.map((slot) => ({
          ...slot,
          lectures: slot.lectures.filter(
            (lec) => normalizeRoomNumber(lec.room_number)?.toLowerCase() === normalizedRoom,
          ),
        })),
      }));
    }

    return res.json({ success: true, data: serialized });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/room/:roomNumber/weekly ─────────────────────────────
const getRoomWeekly = async (req, res) => {
  try {
    const { branchId, sem, division } = req.query;
    const roomNumber = normalizeRoomNumber(req.params.roomNumber);

    if (!roomNumber) {
      return res.status(400).json({ success: false, message: 'roomNumber is required' });
    }

    const where = { dateOfWeek: { in: DAYS_ORDER } };
    if (branchId) where.branch_id = parseInt(branchId, 10);
    if (sem) where.sem = sem.toString();
    if (division) where.division = division;

    const timetables = await prisma.tblTimeTable.findMany({
      where,
      include: INCLUDE_FULL,
    });

    timetables.sort((a, b) => DAYS_ORDER.indexOf(a.dateOfWeek) - DAYS_ORDER.indexOf(b.dateOfWeek));

    const { subjectMap, facultyMap } = await enrichLectures(timetables);
    const serialized = serializeTimetables(timetables, subjectMap, facultyMap);
    const normalizedRoom = roomNumber.toLowerCase();

    const dayMap = {};
    for (const dayRow of serialized) {
      const dayName = dayRow.dateOfWeek;
      if (!dayMap[dayName]) {
        dayMap[dayName] = {
          id: dayRow.id,
          dateOfWeek: dayName,
          branch_id: null,
          sem: null,
          division: null,
          academic_id: null,
          slots: {},
        };
      }

      for (const slot of dayRow.slots) {
        const matchingLectures = slot.lectures.filter(
          (lec) => normalizeRoomNumber(lec.room_number)?.toLowerCase() === normalizedRoom,
        );
        if (!matchingLectures.length) continue;

        const slotKey = `${slot.startTimeHr}_${slot.startTimeMinutes}_${slot.endTimeHr}_${slot.endTimeMinutes}`;
        if (!dayMap[dayName].slots[slotKey]) {
          dayMap[dayName].slots[slotKey] = {
            ...slot,
            lectures: [],
          };
        }

        dayMap[dayName].slots[slotKey].lectures.push(...matchingLectures);
      }
    }

    const aggregated = DAYS_ORDER
      .filter((dayName) => dayMap[dayName])
      .map((dayName) => {
        const day = dayMap[dayName];
        const slots = Object.values(day.slots).sort((a, b) => {
          if (a.startTimeHr !== b.startTimeHr) return a.startTimeHr - b.startTimeHr;
          return a.startTimeMinutes - b.startTimeMinutes;
        });

        return {
          id: day.id,
          dateOfWeek: day.dateOfWeek,
          branch_id: day.branch_id,
          sem: day.sem,
          division: day.division,
          academic_id: day.academic_id,
          slots,
        };
      });

    return res.json({ success: true, data: aggregated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/reports/classroom-usage ──────────────────────────────
const getClassroomUsageReport = async (_req, res) => {
  try {
    const [rooms, grouped, slotTemplates] = await Promise.all([
      prisma.room.findMany({ orderBy: { room_number: 'asc' } }),
      prisma.timeTableBatchSubject.groupBy({
        by: ['room_number'],
        where: {
          room_number: {
            not: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.timeSlotTemplate.findMany({
        where: { is_active: 1, is_break: 0 },
        select: { id: true },
      }).catch(() => []),
    ]);

    const slotsPerDay = slotTemplates.length || 8;
    const totalWeeklySlotsPerRoom = slotsPerDay * WEEKLY_WORKING_DAYS;

    const countByRoom = {};
    for (const row of grouped) {
      const normalized = normalizeRoomNumber(row.room_number);
      if (normalized) countByRoom[normalized] = row._count._all;
    }

    const roomNumbers = new Set(rooms.map((r) => normalizeRoomNumber(r.room_number)).filter(Boolean));

    const usage = rooms
      .map((room) => {
        const roomNumber = normalizeRoomNumber(room.room_number) || 'Unknown';
        const assignedLectures = countByRoom[roomNumber] || 0;
        const utilizationPercent = totalWeeklySlotsPerRoom
          ? Number(((assignedLectures / totalWeeklySlotsPerRoom) * 100).toFixed(2))
          : 0;

        return {
          roomId: room.id,
          roomNumber,
          name: room.name,
          roomType: room.room_type,
          branchId: room.branch_id,
          isActive: room.is_active,
          assignedLectures,
          totalWeeklySlotsPerRoom,
          utilizationPercent,
        };
      })
      .sort((a, b) => b.assignedLectures - a.assignedLectures);

    for (const [roomNumber, assignedLectures] of Object.entries(countByRoom)) {
      if (roomNumbers.has(roomNumber)) continue;

      const utilizationPercent = totalWeeklySlotsPerRoom
        ? Number(((assignedLectures / totalWeeklySlotsPerRoom) * 100).toFixed(2))
        : 0;

      usage.push({
        roomId: null,
        roomNumber,
        name: null,
        roomType: null,
        branchId: null,
        isActive: null,
        assignedLectures,
        totalWeeklySlotsPerRoom,
        utilizationPercent,
      });
    }

    return res.json({
      success: true,
      data: {
        slotsPerDay,
        totalWeeklySlotsPerRoom,
        rooms: usage,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Helper to check if two time ranges overlap
function timeRangesOverlap(sh1, sm1, eh1, em1, sh2, sm2, eh2, em2) {
  const start1 = sh1 * 60 + sm1;
  const end1 = eh1 * 60 + em1;
  const start2 = sh2 * 60 + sm2;
  const end2 = eh2 * 60 + em2;
  return start1 < end2 && start2 < end1;
}

// ── GET /api/timetable/today ─────────────────────────────────────────────────
const getToday = async (req, res) => {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDate = new Date();
  req.query.dateOfWeek = DAYS[todayDate.getDay()];

  try {
    const { branchId, sem, division } = req.query;
    const where = {};
    if (branchId)              where.branch_id = parseInt(branchId);
    if (sem)                   where.sem       = sem.toString();
    if (division)              where.division  = division;
    if (req.query.dateOfWeek)  where.dateOfWeek = req.query.dateOfWeek;

    const timetables = await prisma.tblTimeTable.findMany({ where, include: INCLUDE_FULL });
    const { subjectMap, facultyMap } = await enrichLectures(timetables);

    const serialized = serializeTimetables(timetables, subjectMap, facultyMap);

    return res.json({ success: true, data: serialized });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/faculty/:facultyId ────────────────────────────────────
const getFacultyTimetable = async (req, res) => {
  try {
    let facultyId = BigInt(req.params.facultyId);

    // Resolve user uid to faculty_id if needed
    const facultyByUid = await prisma.faculty.findFirst({
      where: { uid: Number(facultyId) },
    });
    if (facultyByUid) {
      facultyId = BigInt(facultyByUid.faculty_id);
    }

    // Find all batch_subjects for this faculty, join through slots to timetable
    const lectures = await prisma.timeTableBatchSubject.findMany({
      where: { facultyid: facultyId },
      include: {
        time_slot: {
          include: { timetable: true },
        },
      },
    });

    // Collect unique subject codes and faculty IDs to enrich names
    const subjectCodes = new Set();
    const facultyIds = new Set();
    for (const lec of lectures) {
      if (lec.subjectCode) subjectCodes.add(lec.subjectCode);
      if (lec.facultyid) facultyIds.add(Number(lec.facultyid));
    }

    const [subjects, facultyList] = await Promise.all([
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
    const facultyMap = Object.fromEntries(facultyList.map((f) => [f.faculty_id, f.name]));

    // Build a day-grouped structure
    const dayMap = {};
    for (const lec of lectures) {
      const slot = lec.time_slot;
      if (!slot) continue;
      const tt = slot.timetable;
      if (!tt) continue;
      const day = tt.dateOfWeek || 'Unknown';

      if (!dayMap[day]) {
        dayMap[day] = {
          timetable: {
            id:          Number(tt.id),
            dateOfWeek:  tt.dateOfWeek,
            branch_id:   tt.branch_id,
            sem:         tt.sem,
            division:    tt.division,
            academic_id: tt.academic_id,
            fromDate:    tt.fromDate,
            toDate:      tt.toDate,
          },
          slotsMap: {},
        };
      }

      const slotId = Number(slot.id);
      if (!dayMap[day].slotsMap[slotId]) {
        dayMap[day].slotsMap[slotId] = {
          id:               slotId,
          timetable_id:     Number(slot.timetable_id),
          startTimeHr:      slot.startTimeHr,
          startTimeMinutes: slot.startTimeMinutes,
          endTimeHr:        slot.endTimeHr,
          endTimeMinutes:   slot.endTimeMinutes,
          lectures: [],
        };
      }

      dayMap[day].slotsMap[slotId].lectures.push({
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
      });
    }

    // Convert slotsMap to sorted slots list
    const result = {};
    for (const day of Object.keys(dayMap)) {
      const dayData = dayMap[day];
      const slotsList = Object.values(dayData.slotsMap);
      slotsList.sort((a, b) => {
        if (a.startTimeHr !== b.startTimeHr) {
          return a.startTimeHr - b.startTimeHr;
        }
        return a.startTimeMinutes - b.startTimeMinutes;
      });
      result[day] = {
        timetable: dayData.timetable,
        slots: slotsList,
      };
    }

    return res.json({ success: true, data: result });
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
    const branchIdRaw  = req.body.branchId     || req.body.branch_id;
    const semRaw       = req.body.sem          || req.body.semester;
    const division     = req.body.division;
    const academicYear = req.body.academicYear || req.body.academic_year;
    const force = parseBoolean(req.body.force ?? req.body.overwrite);
    const dryRun = parseBoolean(req.body.dryRun ?? req.body.dry_run);
    const enforceLabRooms = parseBoolean(req.body.enforceLabRooms ?? req.body.enforce_lab_rooms);
    const fillCompact = parseBoolean(req.body.fillCompact ?? req.body.fill_compact);

    if (!branchIdRaw || !semRaw || !division) {
      return res.status(400).json({ success: false, message: 'branchId, sem, and division are required' });
    }

    const branchId = parseIntSafe(branchIdRaw);
    const sem = parseIntSafe(semRaw);

    if (!branchId || !sem) {
      return res.status(400).json({
        success: false,
        message: 'branchId and sem must be valid numbers',
      });
    }

    const normalizedDivision = String(division).trim().toUpperCase();
    if (!['A', 'B'].includes(normalizedDivision)) {
      return res.status(400).json({ success: false, message: 'Only division A or B is supported' });
    }

    const classConfigs = [{
      branchId,
      sem,
      semStr: String(sem),
      division: normalizedDivision,
    }];

    const issues = await collectGenerationPreflightIssues({ classConfigs });
    const existingClasses = await findExistingTimetableClasses({ classConfigs });

    if (dryRun) {
      return res.json({
        success: true,
        ready: issues.length === 0,
        issues,
        existingClasses,
      });
    }

    if (issues.length) {
      return res.status(422).json({
        success: false,
        code: 'PRECHECK_FAILED',
        message: 'Preflight validation failed. Resolve the issues and try again.',
        issues,
      });
    }

    if (existingClasses.length && !force) {
      return res.status(409).json({
        success: false,
        code: 'EXISTING_TIMETABLE',
        message: 'Timetable already exists for the selected class. Confirm overwrite to regenerate.',
        existingClasses,
      });
    }

    const result = await generateSchedule({
      branchId,
      sem,
      division: normalizedDivision,
      academicYear,
      createdBy: req.user.uid,
      enforceLabRooms,
      fillCompact,
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

// ── POST /api/timetable/generate-all ─────────────────────────────────────────
const generateAll = async (req, res) => {
  try {
    const academicYear = req.body.academicYear || req.body.academic_year;
    const requestedDivisions = Array.isArray(req.body.divisions) ? req.body.divisions : undefined;
    const termTypeRaw = req.body.termType ?? req.body.term_type;
    const termType = termTypeRaw ? String(termTypeRaw).trim().toLowerCase() : undefined;
    const force = parseBoolean(req.body.force ?? req.body.overwrite);
    const dryRun = parseBoolean(req.body.dryRun ?? req.body.dry_run);
    const enforceLabRooms = parseBoolean(req.body.enforceLabRooms ?? req.body.enforce_lab_rooms);
    const fillCompact = parseBoolean(req.body.fillCompact ?? req.body.fill_compact);

    if (termType && !['even', 'odd'].includes(termType)) {
      return res.status(400).json({
        success: false,
        message: 'termType must be either "even" or "odd"',
      });
    }

    const divisions = requestedDivisions
      ? requestedDivisions
        .map((d) => String(d).trim().toUpperCase())
        .filter((d) => ['A', 'B'].includes(d))
      : ['A', 'B'];

    if (!divisions.length) {
      return res.status(400).json({
        success: false,
        message: 'At least one valid division (A/B) is required',
      });
    }

    const branchIds = Array.isArray(req.body.branchIds || req.body.branch_ids)
      ? (req.body.branchIds || req.body.branch_ids)
      : undefined;
    const semesters = Array.isArray(req.body.semesters) ? req.body.semesters : undefined;

    const classConfigs = await buildClassConfigsForGenerateAll({
      branchIds,
      semesters,
      divisions,
      termType,
    });

    const issues = await collectGenerationPreflightIssues({ classConfigs });
    const existingClasses = await findExistingTimetableClasses({ classConfigs });

    if (dryRun) {
      return res.json({
        success: true,
        ready: issues.length === 0,
        issues,
        existingClasses,
        classCount: classConfigs.length,
      });
    }

    if (issues.length) {
      return res.status(422).json({
        success: false,
        code: 'PRECHECK_FAILED',
        message: 'Preflight validation failed. Resolve the issues and try again.',
        issues,
      });
    }

    if (existingClasses.length && !force) {
      return res.status(409).json({
        success: false,
        code: 'EXISTING_TIMETABLE',
        message: 'Timetable already exists for the selected classes. Confirm overwrite to regenerate.',
        existingClasses,
      });
    }

    const result = await generateAllSchedules({
      academicYear,
      createdBy: req.user.uid,
      divisions,
      branchIds,
      semesters,
      termType,
      enforceLabRooms,
      fillCompact,
    });

    return res.json({
      success: true,
      message: `Generated timetable for ${result.classCount} classes in one optimized run`,
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

    const current = await prisma.timeTableBatchSubject.findUnique({
      where: { id },
      include: {
        time_slot: {
          include: { timetable: true },
        },
      },
    });

    if (!current) {
      return res.status(404).json({ success: false, message: 'Lecture slot not found' });
    }

    const nextFacultyId = facultyid !== undefined ? BigInt(facultyid) : current.facultyid;
    const nextRoomNumber = room_number !== undefined
      ? normalizeRoomNumber(room_number)
      : normalizeRoomNumber(current.room_number);

    const dayName = current.time_slot?.timetable?.dateOfWeek;
    const startTimeHr = current.time_slot?.startTimeHr;
    const startTimeMinutes = current.time_slot?.startTimeMinutes;

    // Prevent teacher double booking across all classes for the same day/time.
    if (nextFacultyId && dayName) {
      const conflict = await findFacultyConflict({
        excludeIds: [id],
        facultyId: nextFacultyId,
        dayName,
        startTimeHr,
        startTimeMinutes,
      });

      if (conflict) {
        return res.status(409).json({
          success: false,
          message: 'Faculty conflict: teacher is already assigned to another class in the same time slot',
        });
      }
    }

    // Prevent room double booking across all classes for the same day/time.
    if (nextRoomNumber && dayName) {
      const roomConflict = await findRoomConflict({
        excludeIds: [id],
        roomNumber: nextRoomNumber,
        dayName,
        startTimeHr,
        startTimeMinutes,
      });

      if (roomConflict) {
        return res.status(409).json({
          success: false,
          message: 'Room conflict: classroom is already assigned in the same time slot',
        });
      }
    }

    const data = {};
    if (subjectCode   !== undefined) data.subjectCode   = subjectCode;
    if (facultyid     !== undefined) data.facultyid     = nextFacultyId;
    if (typeOfLecture !== undefined) data.typeOfLecture = typeOfLecture;
    if (room_number   !== undefined) data.room_number   = nextRoomNumber;
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

// ── PUT /api/timetable/slots/:id/move ───────────────────────────────────────
const moveSlot = async (req, res) => {
  try {
    const id = BigInt(req.params.id);
    const targetSlotRaw = req.body.targetSlotId ?? req.body.target_slot_id;
    const swap = req.body.swap !== false;

    if (!targetSlotRaw) {
      return res.status(400).json({ success: false, message: 'targetSlotId is required' });
    }

    const targetSlotId = BigInt(targetSlotRaw);

    const sourceLecture = await prisma.timeTableBatchSubject.findUnique({
      where: { id },
      include: {
        time_slot: {
          include: { timetable: true },
        },
      },
    });

    if (!sourceLecture) {
      return res.status(404).json({ success: false, message: 'Lecture slot not found' });
    }

    const sourceSlotId = sourceLecture.time_table_detailed_id;
    if (!sourceSlotId || !sourceLecture.time_slot?.timetable) {
      return res.status(400).json({ success: false, message: 'Source slot context is invalid' });
    }

    if (sourceSlotId === targetSlotId) {
      return res.json({ success: true, message: 'No move needed', data: { moved: false } });
    }

    const targetSlot = await prisma.timeTimeDetailed.findUnique({
      where: { id: targetSlotId },
      include: { timetable: true },
    });

    if (!targetSlot || !targetSlot.timetable) {
      return res.status(404).json({ success: false, message: 'Target slot not found' });
    }

    const targetLecture = await prisma.timeTableBatchSubject.findFirst({
      where: { time_table_detailed_id: targetSlotId },
      include: {
        time_slot: {
          include: { timetable: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    const sourceDay = sourceLecture.time_slot.timetable.dateOfWeek;
    const sourceStartHr = sourceLecture.time_slot.startTimeHr;
    const sourceStartMin = sourceLecture.time_slot.startTimeMinutes;
    const targetDay = targetSlot.timetable.dateOfWeek;
    const targetStartHr = targetSlot.startTimeHr;
    const targetStartMin = targetSlot.startTimeMinutes;

    const sourceExclude = [id];
    if (targetLecture && swap) sourceExclude.push(targetLecture.id);

    if (sourceLecture.facultyid) {
      const facultyConflict = await findFacultyConflict({
        excludeIds: sourceExclude,
        facultyId: sourceLecture.facultyid,
        dayName: targetDay,
        startTimeHr: targetStartHr,
        startTimeMinutes: targetStartMin,
      });

      if (facultyConflict) {
        return res.status(409).json({
          success: false,
          message: 'Faculty conflict at target slot',
        });
      }
    }

    if (normalizeRoomNumber(sourceLecture.room_number)) {
      const roomConflict = await findRoomConflict({
        excludeIds: sourceExclude,
        roomNumber: sourceLecture.room_number,
        dayName: targetDay,
        startTimeHr: targetStartHr,
        startTimeMinutes: targetStartMin,
      });

      if (roomConflict) {
        return res.status(409).json({
          success: false,
          message: 'Room conflict at target slot',
        });
      }
    }

    if (targetLecture && !swap) {
      return res.status(409).json({
        success: false,
        message: 'Target slot already contains a lecture. Enable swap to continue.',
      });
    }

    if (targetLecture) {
      const targetExclude = [targetLecture.id, id];

      if (targetLecture.facultyid) {
        const conflict = await findFacultyConflict({
          excludeIds: targetExclude,
          facultyId: targetLecture.facultyid,
          dayName: sourceDay,
          startTimeHr: sourceStartHr,
          startTimeMinutes: sourceStartMin,
        });

        if (conflict) {
          return res.status(409).json({
            success: false,
            message: 'Faculty conflict while swapping into source slot',
          });
        }
      }

      if (normalizeRoomNumber(targetLecture.room_number)) {
        const conflict = await findRoomConflict({
          excludeIds: targetExclude,
          roomNumber: targetLecture.room_number,
          dayName: sourceDay,
          startTimeHr: sourceStartHr,
          startTimeMinutes: sourceStartMin,
        });

        if (conflict) {
          return res.status(409).json({
            success: false,
            message: 'Room conflict while swapping into source slot',
          });
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.timeTableBatchSubject.update({
        where: { id },
        data: { time_table_detailed_id: targetSlotId },
      });

      if (targetLecture && swap) {
        await tx.timeTableBatchSubject.update({
          where: { id: targetLecture.id },
          data: { time_table_detailed_id: sourceSlotId },
        });
      }
    });

    return res.json({
      success: true,
      message: targetLecture && swap ? 'Lecture swapped successfully' : 'Lecture moved successfully',
      data: {
        moved: true,
        swapped: Boolean(targetLecture && swap),
        targetSlotId: Number(targetSlotId),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getWeekly,
  getRoomWeekly,
  getClassroomUsageReport,
  getToday,
  getFacultyTimetable,
  getAll,
  getSlots,
  generate,
  generateAll,
  updateSlot,
  moveSlot,
};
