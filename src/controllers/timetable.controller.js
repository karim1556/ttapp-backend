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

// ── POST /api/timetable/generate-all ─────────────────────────────────────────
const generateAll = async (req, res) => {
  try {
    const academicYear = req.body.academicYear || req.body.academic_year;
    const divisions = Array.isArray(req.body.divisions) ? req.body.divisions : undefined;
    const branchIds = Array.isArray(req.body.branchIds || req.body.branch_ids)
      ? (req.body.branchIds || req.body.branch_ids)
      : undefined;
    const semesters = Array.isArray(req.body.semesters) ? req.body.semesters : undefined;

    const result = await generateAllSchedules({
      academicYear,
      createdBy: req.user.uid,
      divisions,
      branchIds,
      semesters,
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
