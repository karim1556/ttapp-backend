'use strict';
/**
 * Timetable Generation Service
 * ─────────────────────────────
 * Greedy constraint-satisfaction algorithm:
 *   1. Load subjects (branch + semester), faculty constraints
 *   2. Load time slot templates from DB (fallback to 8 hardcoded slots)
 *   3. Clear existing timetable for the target branch/sem/division
 *   4. Build a week grid (6 days × N slots) respecting:
 *        • Faculty daily-max and weekly-max limits
 *        • Faculty unavailable-slot constraints
 *        • Lab subjects need two consecutive non-break slots
 *        • No two lectures share the same faculty at the same (day, slot)
 *   5. Persist: tbl_time_table → time_time_detailed → time_table_batch_subject
 */

const prisma = require('../config/prisma');

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Fallback: 8 slots per day (skip 12:00–13:00 lunch)
const DEFAULT_TIME_SLOTS = [
  { startTimeHr: 8,  startTimeMinutes: 0,  endTimeHr: 9,  endTimeMinutes: 0  },
  { startTimeHr: 9,  startTimeMinutes: 0,  endTimeHr: 10, endTimeMinutes: 0  },
  { startTimeHr: 10, startTimeMinutes: 0,  endTimeHr: 11, endTimeMinutes: 0  },
  { startTimeHr: 11, startTimeMinutes: 0,  endTimeHr: 12, endTimeMinutes: 0  },
  { startTimeHr: 13, startTimeMinutes: 0,  endTimeHr: 14, endTimeMinutes: 0  },
  { startTimeHr: 14, startTimeMinutes: 0,  endTimeHr: 15, endTimeMinutes: 0  },
  { startTimeHr: 15, startTimeMinutes: 0,  endTimeHr: 16, endTimeMinutes: 0  },
  { startTimeHr: 16, startTimeMinutes: 0,  endTimeHr: 17, endTimeMinutes: 0  },
];

/** Load active time slot templates from DB; fall back to DEFAULT_TIME_SLOTS */
async function loadTimeSlots() {
  try {
    const dbSlots = await prisma.timeSlotTemplate.findMany({
      where: { is_active: 1 },
      orderBy: [{ sort_order: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
    });
    // Need at least 4 non-break slots to generate a meaningful timetable
    const nonBreakSlots = dbSlots.filter(s => !s.is_break);
    if (nonBreakSlots.length >= 4) return dbSlots;
    if (dbSlots.length > 0) {
      console.warn(`[loadTimeSlots] Only ${nonBreakSlots.length} non-break slots in DB – falling back to defaults`);
    }
  } catch (_) {
    // table may not exist yet in older deploys
  }
  return DEFAULT_TIME_SLOTS;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
}

/** Resolve a professor_assign value (name or numeric id) to a faculty_id */
function resolveFacultyId(professorAssign, facultyMap, facultyByName) {
  if (!professorAssign) return null;
  const asInt = parseInt(professorAssign, 10);
  if (!isNaN(asInt) && facultyMap[asInt]) return asInt;
  return facultyByName[professorAssign.toLowerCase().trim()] ?? null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {number|string} options.branchId
 * @param {string}        options.sem          e.g. "3"
 * @param {string}        options.division     e.g. "A"
 * @param {number|string} [options.academicYear]
 * @param {number|string} [options.createdBy]
 * @returns {Promise<{ days: number, slotsAssigned: number }>}
 */
async function generateSchedule({ branchId, sem, division, academicYear, createdBy }) {
  const bId = parseInt(branchId, 10);
  const semStr = sem.toString();

  // ── 1. Load time slot templates (DB-first, fallback to default) ────────────
  const TIME_SLOTS = await loadTimeSlots();

  // ── 2. Load subjects ───────────────────────────────────────────────────────
  const subjects = await prisma.subject.findMany({
    where: { branch_id: bId, semester: parseInt(sem, 10) },
  });

  if (subjects.length === 0) {
    throw new Error(`No subjects found for branch ${bId}, semester ${sem}`);
  }

  // ── 3. Load faculty + their constraints ────────────────────────────────────
  const allFaculty = await prisma.faculty.findMany({
    where:   { branch_id: bId },
    include: { constraints: true },
  });

  if (allFaculty.length === 0) {
    throw new Error(`No faculty found for branch ${bId}. Please add teachers with the correct branch first.`);
  }

  const facultyMap    = {};   // id  → faculty row
  const facultyByName = {};   // lowercase name → id

  for (const f of allFaculty) {
    facultyMap[f.faculty_id] = f;
    if (f.name) facultyByName[f.name.toLowerCase().trim()] = f.faculty_id;
  }

  const constraintMap = {};  // facultyId → FacultyConstraint
  for (const f of allFaculty) {
    if (f.constraints) constraintMap[f.faculty_id] = f.constraints;
  }

  // ── 3. Build requirement list ──────────────────────────────────────────────
  // Also check copo_usercourse_users for faculty-subject mapping
  const requirements = subjects.map((subj) => {
    const lecturesNeeded = Math.ceil(subj.totalcredits ?? 3);
    const isPractical    = subj.ispractical === 'Yes';
    const facultyId      = resolveFacultyId(subj.professor_assign, facultyMap, facultyByName);

    if (!facultyId) {
      console.warn(`⚠ Subject "${subj.subject_name}" (${subj.subject_code}) has no assigned professor (professor_assign: "${subj.professor_assign}"). It will be skipped.`);
    }

    return {
      subject:          subj,
      facultyId,
      lecturesNeeded:   isPractical ? Math.ceil(lecturesNeeded / 2) : lecturesNeeded, // lab counts as 2-slot block
      lecturesAssigned: 0,
      isPractical,
    };
  });

  // Sort: lab subjects first (need consecutive slots), then by most credits
  requirements.sort((a, b) => {
    if (a.isPractical !== b.isPractical) return a.isPractical ? -1 : 1;
    return b.lecturesNeeded - a.lecturesNeeded;
  });

  // ── 4. Delete existing timetable for this branch/sem/division ─────────────
  const existingTT = await prisma.tblTimeTable.findMany({
    where:  { branch_id: bId, sem: semStr, division },
    select: { id: true },
  });

  if (existingTT.length > 0) {
    const ttIds = existingTT.map((t) => t.id);

    const existingDetails = await prisma.timeTimeDetailed.findMany({
      where:  { timetable_id: { in: ttIds } },
      select: { id: true },
    });
    const detailIds = existingDetails.map((d) => d.id);

    if (detailIds.length > 0) {
      await prisma.timeTableBatchSubject.deleteMany({
        where: { time_table_detailed_id: { in: detailIds } },
      });
      await prisma.timeTimeDetailed.deleteMany({
        where: { id: { in: detailIds } },
      });
    }

    await prisma.tblTimeTable.deleteMany({ where: { id: { in: ttIds } } });
  }

  // ── 5. Greedy scheduling ───────────────────────────────────────────────────
  // grid[day][slotIdx] = assigned requirement (or undefined)
  const grid = {};
  for (const day of DAYS) {
    grid[day] = new Array(TIME_SLOTS.length).fill(null);
  }

  // Track which faculty is used in which (day, slot) across this generation
  const facultySlotUsage = {};  // `${facultyId}_${day}_${slotIdx}` → true

  // Counters for constraint checks
  const facultyDayCount  = {};   // `${facultyId}_${day}` → count
  const facultyWeekCount = {};   // facultyId             → count

  // Filter out subjects with no assigned faculty
  const schedulableReqs = requirements.filter((r) => r.facultyId !== null);

  if (schedulableReqs.length === 0) {
    throw new Error('No subjects have assigned professors. Please assign teachers to subjects (professor_assign) before generating a timetable.');
  }

  for (const req of schedulableReqs) {
    const constraint    = constraintMap[req.facultyId];
    const maxPerDay     = constraint?.max_lectures_per_day    ?? 4;
    const maxPerWeek    = constraint?.total_lectures_per_week ?? 18;
    const unavailable   = parseJson(constraint?.unavailable_slots);

    while (req.lecturesAssigned < req.lecturesNeeded) {
      let placed = false;

      for (const day of DAYS) {
        if (placed) break;

        const dayKey  = `${req.facultyId}_${day}`;
        const dayUsed = facultyDayCount[dayKey] ?? 0;
        if (dayUsed >= maxPerDay) continue;

        const weekUsed = facultyWeekCount[req.facultyId] ?? 0;
        if (weekUsed >= maxPerWeek) break;

        // Check unavailability for the faculty on this day
        const unavailableHours = unavailable
          .filter((u) => u.day === day)
          .map((u) => u.startHour);

        for (let si = 0; si < TIME_SLOTS.length; si++) {
          if (placed) break;
          if (grid[day][si] !== null) continue;  // slot taken

          const slot = TIME_SLOTS[si];
          // Skip break slots – they should never get a lecture assigned
          if (slot.is_break) continue;
          if (unavailableHours.includes(slot.startTimeHr)) continue;

          // Check same faculty not already teaching in this slot (another subject)
          const facultySlotKey = `${req.facultyId}_${day}_${si}`;
          if (facultySlotUsage[facultySlotKey]) continue;

          // Lab subjects need the NEXT slot too (consecutive double period)
          if (req.isPractical) {
            if (si + 1 >= TIME_SLOTS.length) continue;
            if (TIME_SLOTS[si + 1].is_break) continue;  // next slot is a break
            if (grid[day][si + 1] !== null) continue;
            const nextSlotKey = `${req.facultyId}_${day}_${si + 1}`;
            if (facultySlotUsage[nextSlotKey]) continue;
          }

          // Place lecture
          grid[day][si] = req;
          facultySlotUsage[facultySlotKey] = true;
          if (req.isPractical) {
            grid[day][si + 1] = { ...req, _labSecond: true };
            facultySlotUsage[`${req.facultyId}_${day}_${si + 1}`] = true;
          }

          req.lecturesAssigned++;
          facultyDayCount[dayKey]       = dayUsed + 1;
          facultyWeekCount[req.facultyId] = weekUsed + 1;
          placed = true;
        }
      }

      if (!placed) break; // Cannot fit any more lectures for this subject
    }
  }

  // ── 6. Persist to DB ───────────────────────────────────────────────────────
  const createdByBig = createdBy ? BigInt(createdBy) : null;
  let slotsAssigned  = 0;

  for (const day of DAYS) {
    const ttRow = await prisma.tblTimeTable.create({
      data: {
        dateOfWeek:  day,
        branch_id:   bId,
        sem:         semStr,
        division,
        academic_id: academicYear ? parseInt(academicYear, 10) : null,
        createdBy:   createdByBig,
      },
    });

    for (let si = 0; si < TIME_SLOTS.length; si++) {
      const slotDef = TIME_SLOTS[si];

      const detailRow = await prisma.timeTimeDetailed.create({
        data: {
          timetable_id:     ttRow.id,
          startTimeHr:      slotDef.startTimeHr,
          startTimeMinutes: slotDef.startTimeMinutes,
          endTimeHr:        slotDef.endTimeHr,
          endTimeMinutes:   slotDef.endTimeMinutes,
          createdBy:        createdByBig,
        },
      });

      const assignment = grid[day][si];
      if (assignment && !assignment._labSecond) {
        // Only write the primary slot (not the second lab slot placeholder)
        await prisma.timeTableBatchSubject.create({
          data: {
            time_table_detailed_id: detailRow.id,
            typeOfLecture:          assignment.isPractical ? 'Lab' : 'Lecture',
            subjectCode:            assignment.subject.subject_code,
            facultyid:              assignment.facultyId ? BigInt(assignment.facultyId) : null,
            batch:                  division,
            createdBy:              createdByBig,
          },
        });
        slotsAssigned++;
      }
    }
  }

  if (slotsAssigned === 0) {
    throw new Error(
      'Timetable structure was saved but no lectures could be placed. ' +
      'Check that: (1) subjects have a valid professor_assign matching a teacher name, ' +
      '(2) at least 4 active non-break time slots are configured, ' +
      '(3) faculty constraints are not blocking all slots.'
    );
  }

  return { days: DAYS.length, slotsAssigned };
}

module.exports = { generateSchedule };
