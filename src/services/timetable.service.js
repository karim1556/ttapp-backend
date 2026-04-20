'use strict';
/**
 * Timetable Generation Service
 *
 * This service supports:
 * 1) Single class generation (branch + semester + division)
 * 2) All-classes generation in one run (global conflict-aware)
 *
 * AI-style optimization:
 * - Multi-candidate randomized heuristic search
 * - Fitness scoring with penalties for unplaced lectures
 * - Preference bonus for faculty preferred slots
 */

const prisma = require('../config/prisma');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_DIVISIONS = ['A', 'B'];
const DEFAULT_SEMESTER_WEEKS = 16;
const LAB_BATCHES = ['A', 'B', 'C'];

// Fallback: 8 slots per day (skip 12:00-13:00 lunch)
const DEFAULT_TIME_SLOTS = [
  { startTimeHr: 8, startTimeMinutes: 0, endTimeHr: 9, endTimeMinutes: 0 },
  { startTimeHr: 9, startTimeMinutes: 0, endTimeHr: 10, endTimeMinutes: 0 },
  { startTimeHr: 10, startTimeMinutes: 0, endTimeHr: 11, endTimeMinutes: 0 },
  { startTimeHr: 11, startTimeMinutes: 0, endTimeHr: 12, endTimeMinutes: 0 },
  { startTimeHr: 13, startTimeMinutes: 0, endTimeHr: 14, endTimeMinutes: 0 },
  { startTimeHr: 14, startTimeMinutes: 0, endTimeHr: 15, endTimeMinutes: 0 },
  { startTimeHr: 15, startTimeMinutes: 0, endTimeHr: 16, endTimeMinutes: 0 },
  { startTimeHr: 16, startTimeMinutes: 0, endTimeHr: 17, endTimeMinutes: 0 },
];

async function loadTimeSlots() {
  try {
    const dbSlots = await prisma.timeSlotTemplate.findMany({
      where: { is_active: 1 },
      orderBy: [{ sort_order: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
    });

    const nonBreakSlots = dbSlots.filter((s) => !s.is_break);
    if (nonBreakSlots.length >= 4) return dbSlots;

    if (dbSlots.length > 0) {
      console.warn(
        `[loadTimeSlots] Only ${nonBreakSlots.length} non-break slots in DB. Falling back to defaults.`,
      );
    }
  } catch (_) {
    // Fallback is intentional if table does not exist or DB is not ready.
  }

  return DEFAULT_TIME_SLOTS;
}

function parseJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function parseFiniteInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSemestersFromTermType(termType) {
  const t = String(termType || '').trim().toLowerCase();
  if (t === 'even') return [2, 4, 6, 8];
  if (t === 'odd') return [1, 3, 5, 7];
  return null;
}

function resolveSubjectWeeklyHours(subject) {
  const directWeekly = parseFiniteInt(subject?.weekly_hours);
  if (directWeekly && directWeekly > 0) return directWeekly;

  const semesterHours = parseFiniteInt(subject?.semester_hours);
  if (semesterHours && semesterHours > 0) {
    return Math.max(1, Math.ceil(semesterHours / DEFAULT_SEMESTER_WEEKS));
  }

  const credits = parseFiniteNumber(subject?.totalcredits);
  if (credits && credits > 0) return Math.ceil(credits);

  return 1;
}

function shuffleArray(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeDivision(division) {
  return String(division || '').trim().toUpperCase();
}

function normalizeRoomType(type) {
  return String(type || 'Classroom').trim().toLowerCase();
}

function isLabRoom(room) {
  const type = normalizeRoomType(room?.room_type);
  return type === 'lab' || type === 'laboratory';
}

function buildRoomPoolByClass(classConfigs, rooms) {
  const activeRooms = (rooms || []).filter((r) => (r?.is_active ?? 1) !== 0);

  const byClass = {};
  for (const config of classConfigs) {
    const cKey = classKey(config);

    const branchScoped = activeRooms.filter(
      (r) => r.branch_id === null || r.branch_id === undefined || r.branch_id === config.branchId,
    );

    const pool = branchScoped.length ? branchScoped : activeRooms;

    byClass[cKey] = {
      all: pool,
      labs: pool.filter(isLabRoom),
      regular: pool.filter((r) => !isLabRoom(r)),
    };
  }

  return byClass;
}

function findAvailableRoomForPlacement({
  req,
  day,
  slotIdx,
  timeSlots,
  roomPoolByClass,
  roomSlotUsage,
}) {
  const pool = roomPoolByClass[req.classKey] || { all: [], labs: [], regular: [] };

  const candidates = req.isPractical
    ? (pool.labs.length ? pool.labs : pool.all)
    : (pool.regular.length ? pool.regular : pool.all);

  if (!candidates.length) return null;

  for (const room of candidates) {
    const key = `${day}_${slotIdx}_${room.id}`;
    if (roomSlotUsage[key]) continue;

    if (req.isPractical) {
      if (slotIdx + 1 >= timeSlots.length) continue;

      const nextSlot = timeSlots[slotIdx + 1];
      if (nextSlot?.is_break) continue;

      const nextKey = `${day}_${slotIdx + 1}_${room.id}`;
      if (roomSlotUsage[nextKey]) continue;
    }

    return room;
  }

  return null;
}

function normalizeClassConfig(raw) {
  const branchId = parseInt(raw?.branchId, 10);
  const semVal = raw?.sem ?? raw?.semester;
  const semNum = parseInt(semVal, 10);
  const division = normalizeDivision(raw?.division);

  if (Number.isNaN(branchId) || Number.isNaN(semNum) || !division) return null;

  return {
    branchId,
    sem: semNum,
    semStr: String(semNum),
    division,
  };
}

function classKey(config) {
  return `${config.branchId}_${config.semStr}_${config.division}`;
}

function pairKey(config) {
  return `${config.branchId}_${config.semStr}`;
}

function getSlotHour(slot) {
  const hour = slot?.startHour ?? slot?.start_hour ?? slot?.hour;
  const parsed = parseInt(hour, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function resolveFacultyId(professorAssign, facultyMap, facultyByName) {
  if (!professorAssign) return null;

  const asInt = parseInt(professorAssign, 10);
  if (!Number.isNaN(asInt) && facultyMap[asInt]) return asInt;

  const byName = String(professorAssign).toLowerCase().trim();
  return facultyByName[byName] ?? null;
}

function createFacultyLookups(allFaculty) {
  const facultyMap = {};
  const facultyByName = {};
  const constraintMap = {};

  for (const f of allFaculty) {
    facultyMap[f.faculty_id] = f;
    if (f.name) facultyByName[String(f.name).toLowerCase().trim()] = f.faculty_id;
    if (f.constraints) constraintMap[f.faculty_id] = f.constraints;
  }

  return { facultyMap, facultyByName, constraintMap };
}

function isUnavailable(constraint, day, startHour) {
  const unavailable = parseJson(constraint?.unavailable_slots);
  return unavailable.some((slot) => slot?.day === day && getSlotHour(slot) === startHour);
}

function isPreferredSlot(constraint, day, startHour) {
  const preferred = parseJson(constraint?.preferred_slots);
  return preferred.some((slot) => slot?.day === day && getSlotHour(slot) === startHour);
}

function makeEmptyGrid(classKeys, slotCount) {
  const grid = {};

  for (const key of classKeys) {
    grid[key] = {};
    for (const day of DAYS) {
      grid[key][day] = new Array(slotCount).fill(null);
    }
  }

  return grid;
}

function expandBatchAssignments(assignment) {
  if (!assignment) return [];

  if (Array.isArray(assignment.labBatchAssignments) && assignment.labBatchAssignments.length) {
    return assignment.labBatchAssignments;
  }

  return [assignment];
}

function buildUsageMaps({ grid, classKeys, timeSlots }) {
  const facultyUsage = {};
  const roomUsage = {};

  for (const cKey of classKeys) {
    for (const day of DAYS) {
      const dayGrid = grid[cKey]?.[day] || [];

      for (let si = 0; si < dayGrid.length; si++) {
        const slotDef = timeSlots[si];
        if (slotDef?.is_break) continue;

        const assignment = dayGrid[si];
        if (!assignment) continue;

        const unitAssignments = expandBatchAssignments(assignment);
        for (const unit of unitAssignments) {
          if (unit.facultyId) {
            facultyUsage[`${unit.facultyId}_${day}_${si}`] = cKey;
          }

          if (unit.roomId) {
            roomUsage[`${unit.roomId}_${day}_${si}`] = cKey;
          }
        }
      }
    }
  }

  return { facultyUsage, roomUsage };
}

function compactScheduleGrid({ grid, classKeys, timeSlots }) {
  const { facultyUsage, roomUsage } = buildUsageMaps({ grid, classKeys, timeSlots });
  let compactMoves = 0;

  const clearUsage = (assignment, day, slotIdx) => {
    if (!assignment) return;

    const unitAssignments = expandBatchAssignments(assignment);
    for (const unit of unitAssignments) {
      if (unit.facultyId) {
        delete facultyUsage[`${unit.facultyId}_${day}_${slotIdx}`];
      }

      if (unit.roomId) {
        delete roomUsage[`${unit.roomId}_${day}_${slotIdx}`];
      }
    }
  };

  const setUsage = (assignment, cKey, day, slotIdx) => {
    if (!assignment) return;

    const unitAssignments = expandBatchAssignments(assignment);
    for (const unit of unitAssignments) {
      if (unit.facultyId) {
        facultyUsage[`${unit.facultyId}_${day}_${slotIdx}`] = cKey;
      }

      if (unit.roomId) {
        roomUsage[`${unit.roomId}_${day}_${slotIdx}`] = cKey;
      }
    }
  };

  const canOccupy = (assignment, cKey, day, slotIdx, dayGrid) => {
    if (slotIdx < 0 || slotIdx >= timeSlots.length) return false;

    const slotDef = timeSlots[slotIdx];
    if (slotDef?.is_break) return false;
    if (dayGrid[slotIdx] !== null) return false;

    const unitAssignments = expandBatchAssignments(assignment);
    for (const unit of unitAssignments) {
      if (unit.facultyId) {
        const key = `${unit.facultyId}_${day}_${slotIdx}`;
        if (facultyUsage[key] && facultyUsage[key] !== cKey) return false;
      }

      if (unit.roomId) {
        const key = `${unit.roomId}_${day}_${slotIdx}`;
        if (roomUsage[key] && roomUsage[key] !== cKey) return false;
      }
    }

    return true;
  };

  for (const cKey of classKeys) {
    for (const day of DAYS) {
      const dayGrid = grid[cKey][day];

      for (let target = 0; target < dayGrid.length; target++) {
        const targetSlot = timeSlots[target];
        if (targetSlot?.is_break) continue;
        if (dayGrid[target] !== null) continue;

        let source = -1;
        let candidate = null;

        for (let probe = target + 1; probe < dayGrid.length; probe++) {
          const current = dayGrid[probe];
          if (!current || current._labSecond) continue;

          if (!canOccupy(current, cKey, day, target, dayGrid)) {
            continue;
          }

          const isPractical = Boolean(current.isPractical);
          if (isPractical) {
            if (probe + 1 >= dayGrid.length) continue;
            const secondCurrent = dayGrid[probe + 1];
            if (!secondCurrent || !secondCurrent._labSecond) continue;

            if (!canOccupy(current, cKey, day, target + 1, dayGrid)) {
              continue;
            }
          }

          source = probe;
          candidate = current;
          break;
        }

        if (source < 0 || !candidate) continue;

        const isPractical = Boolean(candidate.isPractical);
        const secondSourceAssignment = isPractical ? dayGrid[source + 1] : null;

        clearUsage(candidate, day, source);
        dayGrid[source] = null;

        if (isPractical) {
          clearUsage(secondSourceAssignment, day, source + 1);
          dayGrid[source + 1] = null;
        }

        const basePlaced = { ...candidate };
        delete basePlaced._labSecond;
        dayGrid[target] = basePlaced;
        setUsage(basePlaced, cKey, day, target);

        if (isPractical) {
          const secondPlaced = {
            ...basePlaced,
            _labSecond: true,
          };
          dayGrid[target + 1] = secondPlaced;
          setUsage(secondPlaced, cKey, day, target + 1);
        }

        compactMoves += 1;
      }
    }
  }

  return { grid, compactMoves };
}

function canPlaceLecture({
  req,
  day,
  slotIdx,
  timeSlots,
  classDayGrid,
  constraintMap,
  facultyMap,
  facultySlotUsage,
  facultyDayCount,
  facultyWeekCount,
  roomPoolByClass,
  roomSlotUsage,
  classDayLabBlocks,
}) {
  if (classDayGrid[slotIdx] !== null) return false;

  const slot = timeSlots[slotIdx];
  if (slot.is_break) return false;

  const constraint = constraintMap[req.facultyId];
  const dayKey = `${req.facultyId}_${day}`;
  const dayUsed = facultyDayCount[dayKey] ?? 0;
  const weekUsed = facultyWeekCount[req.facultyId] ?? 0;

  const maxPerDay = constraint?.max_lectures_per_day ?? 4;
  const facultyWeekHours = parseFiniteInt(facultyMap?.[req.facultyId]?.weekly_work_hours);
  const maxPerWeek = facultyWeekHours ?? constraint?.total_lectures_per_week ?? 18;

  if (dayUsed >= maxPerDay) return false;
  if (weekUsed >= maxPerWeek) return false;

  if (isUnavailable(constraint, day, slot.startTimeHr)) return false;

  const facKey = `${req.facultyId}_${day}_${slotIdx}`;
  if (facultySlotUsage[facKey]) return false;

  if (req.isPractical) {
    const classDayLabKey = `${req.classKey}_${day}`;
    if ((classDayLabBlocks[classDayLabKey] ?? 0) >= 1) return false;

    if (slotIdx + 1 >= timeSlots.length) return false;
    if (classDayGrid[slotIdx + 1] !== null) return false;

    const nextSlot = timeSlots[slotIdx + 1];
    if (nextSlot.is_break) return false;
    if (isUnavailable(constraint, day, nextSlot.startTimeHr)) return false;

    const nextFacKey = `${req.facultyId}_${day}_${slotIdx + 1}`;
    if (facultySlotUsage[nextFacKey]) return false;
  }

  const room = findAvailableRoomForPlacement({
    req,
    day,
    slotIdx,
    timeSlots,
    roomPoolByClass,
    roomSlotUsage,
  });

  if (!room) return false;

  return room;
}

function scorePlacement({
  req,
  day,
  slotIdx,
  classDayGrid,
  constraintMap,
  facultyDayCount,
  facultyWeekCount,
  subjectDayCount,
  timeSlots,
}) {
  const constraint = constraintMap[req.facultyId];
  const slot = timeSlots[slotIdx];
  const dayKey = `${req.facultyId}_${day}`;
  const dayUsed = facultyDayCount[dayKey] ?? 0;
  const weekUsed = facultyWeekCount[req.facultyId] ?? 0;
  const subjDayKey = `${req.classKey}_${req.subject.subject_code}_${day}`;
  const sameSubjectDay = subjectDayCount[subjDayKey] ?? 0;

  let score = 40;
  if (isPreferredSlot(constraint, day, slot.startTimeHr)) score += 10;

  score -= dayUsed * 2;
  score -= weekUsed * 0.35;
  score -= sameSubjectDay * 4;
  score -= slotIdx * 0.8;

  const prev = slotIdx > 0 ? classDayGrid[slotIdx - 1] : null;
  const next = slotIdx + 1 < timeSlots.length ? classDayGrid[slotIdx + 1] : null;

  if (prev) score += 2;
  if (next && !next._labSecond) score += 2;
  if (!prev && !next) score -= 3;

  if (prev && !prev._labSecond && prev.subject.subject_code === req.subject.subject_code) {
      score -= 3;
  }

  if (req.isPractical) score += 2;

  // Controlled stochasticity for optimizer diversity.
  score += Math.random() * 1.5;

  return score;
}

function buildCandidateSchedule({
  requirements,
  classKeys,
  timeSlots,
  constraintMap,
  facultyMap,
  roomPoolByClass,
  attemptIndex,
}) {
  const grid = makeEmptyGrid(classKeys, timeSlots.length);

  const reqs = requirements.map((r) => ({
    ...r,
    lecturesAssigned: 0,
  }));

  const practicalReqs = reqs.filter((r) => r.isPractical);
  const theoryReqs = reqs.filter((r) => !r.isPractical);

  const facultySlotUsage = {};
  const facultyDayCount = {};
  const facultyWeekCount = {};
  const subjectDayCount = {};
  const roomSlotUsage = {};
  const classDayLabBlocks = {};
  let preferredMatches = 0;

  const practicalByClass = {};
  for (const req of practicalReqs) {
    if (!practicalByClass[req.classKey]) practicalByClass[req.classKey] = [];
    practicalByClass[req.classKey].push(req);
  }

  const pickParallelLabSet = (classPracticalReqs) => {
    const candidates = classPracticalReqs
      .filter((r) => r.lecturesAssigned < r.lecturesNeeded)
      .sort((a, b) => (b.lecturesNeeded - b.lecturesAssigned) - (a.lecturesNeeded - a.lecturesAssigned));

    if (!candidates.length) return null;

    const selected = [];
    const usedFaculty = new Set();
    const usedSubject = new Set();

    for (const candidate of shuffleArray(candidates)) {
      if (selected.length >= LAB_BATCHES.length) break;
      if (usedFaculty.has(candidate.facultyId)) continue;
      if (usedSubject.has(candidate.subject.subject_code)) continue;

      selected.push(candidate);
      usedFaculty.add(candidate.facultyId);
      usedSubject.add(candidate.subject.subject_code);
    }

    return selected.length === LAB_BATCHES.length ? selected : null;
  };

  const findParallelLabPlacement = (bundleReqs) => {
    let best = null;
    const classReq = bundleReqs[0];
    const dayOrder = attemptIndex % 2 === 0 ? DAYS : shuffleArray(DAYS);

    for (const day of dayOrder) {
      const classDayGrid = grid[classReq.classKey][day];
      const classDayLabKey = `${classReq.classKey}_${day}`;
      if ((classDayLabBlocks[classDayLabKey] ?? 0) >= 1) continue;

      const slotOrder = attemptIndex % 3 === 0
        ? Array.from({ length: timeSlots.length }, (_, i) => i)
        : shuffleArray(Array.from({ length: timeSlots.length }, (_, i) => i));

      for (const slotIdx of slotOrder) {
        if (slotIdx + 1 >= timeSlots.length) continue;
        if (classDayGrid[slotIdx] !== null || classDayGrid[slotIdx + 1] !== null) continue;

        const slot = timeSlots[slotIdx];
        const nextSlot = timeSlots[slotIdx + 1];
        if (slot?.is_break || nextSlot?.is_break) continue;

        const localRoomUsage = { ...roomSlotUsage };
        const selectedUnits = [];
        let valid = true;
        let score = 0;

        for (const req of bundleReqs) {
          const constraint = constraintMap[req.facultyId];
          const dayKey = `${req.facultyId}_${day}`;
          const dayUsed = facultyDayCount[dayKey] ?? 0;
          const weekUsed = facultyWeekCount[req.facultyId] ?? 0;

          const maxPerDay = constraint?.max_lectures_per_day ?? 4;
          const facultyWeekHours = parseFiniteInt(facultyMap?.[req.facultyId]?.weekly_work_hours);
          const maxPerWeek = facultyWeekHours ?? constraint?.total_lectures_per_week ?? 18;

          if (dayUsed >= maxPerDay || weekUsed >= maxPerWeek) {
            valid = false;
            break;
          }

          if (isUnavailable(constraint, day, slot.startTimeHr) || isUnavailable(constraint, day, nextSlot.startTimeHr)) {
            valid = false;
            break;
          }

          const facKey = `${req.facultyId}_${day}_${slotIdx}`;
          const nextFacKey = `${req.facultyId}_${day}_${slotIdx + 1}`;
          if (facultySlotUsage[facKey] || facultySlotUsage[nextFacKey]) {
            valid = false;
            break;
          }

          const room = findAvailableRoomForPlacement({
            req,
            day,
            slotIdx,
            timeSlots,
            roomPoolByClass,
            roomSlotUsage: localRoomUsage,
          });

          if (!room) {
            valid = false;
            break;
          }

          selectedUnits.push({ req, room });
          localRoomUsage[`${day}_${slotIdx}_${room.id}`] = true;
          localRoomUsage[`${day}_${slotIdx + 1}_${room.id}`] = true;

          if (isPreferredSlot(constraint, day, slot.startTimeHr)) score += 6;
          score += 8 - (slotIdx * 0.6);
        }

        if (!valid) continue;

        score += Math.random() * 1.25;
        if (!best || score > best.score) {
          best = { day, slotIdx, units: selectedUnits, score };
        }
      }
    }

    return best;
  };

  const classOrder = attemptIndex % 2 === 0 ? classKeys : shuffleArray(classKeys);
  const legacyPracticalReqs = [];

  for (const cKey of classOrder) {
    const classPracticalReqs = practicalByClass[cKey] || [];
    const uniquePracticalSubjects = new Set(classPracticalReqs.map((r) => r.subject.subject_code));
    const uniquePracticalFaculty = new Set(classPracticalReqs.map((r) => r.facultyId));
    const supportsParallelBatches =
      uniquePracticalSubjects.size >= LAB_BATCHES.length
      && uniquePracticalFaculty.size >= LAB_BATCHES.length;

    if (!supportsParallelBatches) {
      legacyPracticalReqs.push(...classPracticalReqs);
      continue;
    }

    let safety = 200;

    while (
      classPracticalReqs.some((r) => r.lecturesAssigned < r.lecturesNeeded)
      && safety > 0
    ) {
      safety -= 1;

      const bundleReqs = pickParallelLabSet(classPracticalReqs);
      if (!bundleReqs) break;

      const bestBundle = findParallelLabPlacement(bundleReqs);
      if (!bestBundle) break;

      const { day, slotIdx, units } = bestBundle;
      const classDayLabKey = `${cKey}_${day}`;

      const labAssignments = units.map((u, idx) => ({
        ...u.req,
        batchCode: LAB_BATCHES[idx],
        roomId: u.room.id,
        roomNumber: u.room.room_number,
      }));

      const baseAssignment = {
        ...labAssignments[0],
        labBatchAssignments: labAssignments,
      };

      grid[cKey][day][slotIdx] = baseAssignment;
      grid[cKey][day][slotIdx + 1] = {
        ...baseAssignment,
        _labSecond: true,
      };

      for (const assignment of labAssignments) {
        facultySlotUsage[`${assignment.facultyId}_${day}_${slotIdx}`] = true;
        facultySlotUsage[`${assignment.facultyId}_${day}_${slotIdx + 1}`] = true;

        roomSlotUsage[`${day}_${slotIdx}_${assignment.roomId}`] = true;
        roomSlotUsage[`${day}_${slotIdx + 1}_${assignment.roomId}`] = true;

        const dayKey = `${assignment.facultyId}_${day}`;
        facultyDayCount[dayKey] = (facultyDayCount[dayKey] ?? 0) + 1;
        facultyWeekCount[assignment.facultyId] = (facultyWeekCount[assignment.facultyId] ?? 0) + 1;

        const subjDayKey = `${assignment.classKey}_${assignment.subject.subject_code}_${day}`;
        subjectDayCount[subjDayKey] = (subjectDayCount[subjDayKey] ?? 0) + 1;

        const constraint = constraintMap[assignment.facultyId];
        const slot = timeSlots[slotIdx];
        if (isPreferredSlot(constraint, day, slot.startTimeHr)) {
          preferredMatches += 1;
        }
      }

      classDayLabBlocks[classDayLabKey] = (classDayLabBlocks[classDayLabKey] ?? 0) + 1;
      for (const unit of units) {
        unit.req.lecturesAssigned += 1;
      }
    }
  }

  const placeSingleRequirement = (req) => {
    while (req.lecturesAssigned < req.lecturesNeeded) {
      let best = null;
      const dayOrder = attemptIndex % 2 === 0 ? DAYS : shuffleArray(DAYS);

      for (const day of dayOrder) {
        const classDayGrid = grid[req.classKey][day];
        const slotOrder = attemptIndex % 3 === 0
          ? Array.from({ length: timeSlots.length }, (_, i) => i)
          : shuffleArray(Array.from({ length: timeSlots.length }, (_, i) => i));

        for (const slotIdx of slotOrder) {
          const availableRoom = canPlaceLecture({
            req,
            day,
            slotIdx,
            timeSlots,
            classDayGrid,
            constraintMap,
            facultyMap,
            facultySlotUsage,
            facultyDayCount,
            facultyWeekCount,
            roomPoolByClass,
            roomSlotUsage,
            classDayLabBlocks,
          });

          if (!availableRoom) continue;

          const score = scorePlacement({
            req,
            day,
            slotIdx,
            classDayGrid,
            constraintMap,
            facultyDayCount,
            facultyWeekCount,
            subjectDayCount,
            timeSlots,
          });

          if (!best || score > best.score) {
            best = { day, slotIdx, score, room: availableRoom };
          }
        }
      }

      if (!best) break;

      const { day, slotIdx } = best;
      const dayGrid = grid[req.classKey][day];
      const slot = timeSlots[slotIdx];
      const constraint = constraintMap[req.facultyId];
      const room = best.room;

      dayGrid[slotIdx] = {
        ...req,
        roomId: room.id,
        roomNumber: room.room_number,
      };
      facultySlotUsage[`${req.facultyId}_${day}_${slotIdx}`] = true;
      roomSlotUsage[`${day}_${slotIdx}_${room.id}`] = true;

      if (req.isPractical) {
        dayGrid[slotIdx + 1] = {
          ...req,
          _labSecond: true,
          roomId: room.id,
          roomNumber: room.room_number,
        };
        facultySlotUsage[`${req.facultyId}_${day}_${slotIdx + 1}`] = true;
        roomSlotUsage[`${day}_${slotIdx + 1}_${room.id}`] = true;

        const classDayLabKey = `${req.classKey}_${day}`;
        classDayLabBlocks[classDayLabKey] = (classDayLabBlocks[classDayLabKey] ?? 0) + 1;
      }

      const dayKey = `${req.facultyId}_${day}`;
      facultyDayCount[dayKey] = (facultyDayCount[dayKey] ?? 0) + 1;
      facultyWeekCount[req.facultyId] = (facultyWeekCount[req.facultyId] ?? 0) + 1;

      const subjDayKey = `${req.classKey}_${req.subject.subject_code}_${day}`;
      subjectDayCount[subjDayKey] = (subjectDayCount[subjDayKey] ?? 0) + 1;

      if (isPreferredSlot(constraint, day, slot.startTimeHr)) {
        preferredMatches += 1;
      }

      req.lecturesAssigned += 1;
    }
  };

  const orderedLegacyPractical = legacyPracticalReqs
    .map((req) => ({
      req,
      hardness: req.lecturesNeeded * 120 + Math.random() * 20 + attemptIndex * 0.1,
    }))
    .sort((a, b) => b.hardness - a.hardness)
    .map((x) => x.req);

  for (const req of orderedLegacyPractical) {
    placeSingleRequirement(req);
  }

  const orderedTheory = theoryReqs
    .map((req) => ({
      req,
      hardness:
        req.lecturesNeeded * 100 +
        Math.random() * 25 +
        attemptIndex * 0.1,
    }))
    .sort((a, b) => b.hardness - a.hardness)
    .map((x) => x.req);

  for (const req of orderedTheory) {
    placeSingleRequirement(req);
  }

  const requiredLectures = reqs.reduce((sum, r) => sum + r.lecturesNeeded, 0);
  const placedLectures = reqs.reduce((sum, r) => sum + r.lecturesAssigned, 0);
  const unplacedLectures = requiredLectures - placedLectures;

  const weeklyLoads = Object.values(facultyWeekCount);
  let imbalancePenalty = 0;
  if (weeklyLoads.length > 1) {
    imbalancePenalty = (Math.max(...weeklyLoads) - Math.min(...weeklyLoads)) * 1.5;
  }

  const score =
    placedLectures * 100 -
    unplacedLectures * 500 -
    imbalancePenalty +
    preferredMatches * 10;

  return {
    grid,
    score,
    placedLectures,
    requiredLectures,
    unplacedLectures,
    preferredMatches,
  };
}

function optimizeSchedule({
  requirements,
  classKeys,
  timeSlots,
  constraintMap,
  facultyMap,
  roomPoolByClass,
  attempts = 12,
}) {
  const totalAttempts = Math.max(1, parseInt(attempts, 10) || 1);
  let best = null;

  for (let i = 0; i < totalAttempts; i++) {
    const candidate = buildCandidateSchedule({
      requirements,
      classKeys,
      timeSlots,
      constraintMap,
      facultyMap,
      roomPoolByClass,
      attemptIndex: i,
    });

    if (!best || candidate.score > best.score) {
      best = candidate;
    }

    // Early stop when all lectures are placed with a stable score.
    if (best.unplacedLectures === 0 && i >= 2) break;
  }

  return {
    ...best,
    attemptsTried: totalAttempts,
  };
}

async function clearExistingTimetables(classConfigs) {
  if (!classConfigs.length) return;

  const filters = classConfigs.map((c) => ({
    branch_id: c.branchId,
    sem: c.semStr,
    division: c.division,
  }));

  const existingTT = await prisma.tblTimeTable.findMany({
    where: { OR: filters },
    select: { id: true },
  });

  if (!existingTT.length) return;

  const ttIds = existingTT.map((t) => t.id);
  const detailRows = await prisma.timeTimeDetailed.findMany({
    where: { timetable_id: { in: ttIds } },
    select: { id: true },
  });

  const detailIds = detailRows.map((d) => d.id);

  if (detailIds.length) {
    await prisma.timeTableBatchSubject.deleteMany({
      where: { time_table_detailed_id: { in: detailIds } },
    });

    await prisma.timeTimeDetailed.deleteMany({
      where: { id: { in: detailIds } },
    });
  }

  await prisma.tblTimeTable.deleteMany({
    where: { id: { in: ttIds } },
  });
}

async function persistSchedule({ classConfigs, grid, timeSlots, academicYear, createdBy }) {
  const createdByBig = createdBy ? BigInt(createdBy) : null;
  let slotsAssigned = 0;
  let daysPersisted = 0;

  for (const config of classConfigs) {
    const cKey = classKey(config);

    for (const day of DAYS) {
      const ttRow = await prisma.tblTimeTable.create({
        data: {
          dateOfWeek: day,
          branch_id: config.branchId,
          sem: config.semStr,
          division: config.division,
          academic_id: academicYear ? parseInt(academicYear, 10) : null,
          createdBy: createdByBig,
        },
      });

      daysPersisted += 1;

      for (let si = 0; si < timeSlots.length; si++) {
        const slotDef = timeSlots[si];

        const detailRow = await prisma.timeTimeDetailed.create({
          data: {
            timetable_id: ttRow.id,
            startTimeHr: slotDef.startTimeHr,
            startTimeMinutes: slotDef.startTimeMinutes,
            endTimeHr: slotDef.endTimeHr,
            endTimeMinutes: slotDef.endTimeMinutes,
            createdBy: createdByBig,
          },
        });

        const assignment = grid[cKey][day][si];
        if (assignment) {
          const batchAssignments = expandBatchAssignments(assignment);

          for (const row of batchAssignments) {
            await prisma.timeTableBatchSubject.create({
              data: {
                time_table_detailed_id: detailRow.id,
                typeOfLecture: row.isPractical ? 'Lab' : 'Lecture',
                subjectCode: row.subject.subject_code,
                facultyid: row.facultyId ? BigInt(row.facultyId) : null,
                room_number: row.roomNumber || null,
                batch: row.isPractical
                  ? (row.batchCode || row.batch || LAB_BATCHES[0])
                  : config.division,
                createdBy: createdByBig,
              },
            });

            slotsAssigned += 1;
          }
        }
      }
    }
  }

  return { daysPersisted, slotsAssigned };
}

async function loadSubjectsByPair(classConfigs) {
  const uniquePairs = new Map();

  for (const config of classConfigs) {
    uniquePairs.set(pairKey(config), {
      branchId: config.branchId,
      sem: config.sem,
      semStr: config.semStr,
    });
  }

  const subjectsByPair = {};

  await Promise.all(
    [...uniquePairs.values()].map(async (pair) => {
      const rows = await prisma.subject.findMany({
        where: {
          branch_id: pair.branchId,
          semester: pair.sem,
        },
      });
      subjectsByPair[`${pair.branchId}_${pair.semStr}`] = rows;
    }),
  );

  return subjectsByPair;
}

function buildRequirementsForClasses({ classConfigs, subjectsByPair, facultyMap, facultyByName }) {
  const requirements = [];
  const skippedSubjects = [];

  for (const config of classConfigs) {
    const pKey = pairKey(config);
    const subjects = subjectsByPair[pKey] || [];

    for (const subj of subjects) {
      const isPractical = subj.ispractical === 'Yes';
      const cKey = classKey(config);

      const weeklyHours = resolveSubjectWeeklyHours(subj);
      const semesterHours = parseFiniteInt(subj.semester_hours);
      const lecturesNeeded = isPractical
        ? Math.max(1, Math.ceil(weeklyHours / 2))
        : Math.max(1, weeklyHours);

      const facultyId = resolveFacultyId(subj.professor_assign, facultyMap, facultyByName);
      if (!facultyId) {
        skippedSubjects.push({
          branchId: config.branchId,
          sem: config.semStr,
          division: config.division,
          subjectCode: subj.subject_code,
        });
        continue;
      }

      requirements.push({
        classKey: cKey,
        branchId: config.branchId,
        semStr: config.semStr,
        division: config.division,
        subject: subj,
        facultyId,
        lecturesNeeded,
        lecturesAssigned: 0,
        isPractical,
        weeklyHours,
        semesterHours,
      });
    }
  }

  return { requirements, skippedSubjects };
}

async function discoverClassConfigs({ branchIds, semesters, divisions, termType }) {
  const parsedBranchIds = Array.isArray(branchIds)
    ? branchIds.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v))
    : [];
  const parsedSemestersInput = Array.isArray(semesters)
    ? semesters.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v))
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

  const where = {};
  if (parsedBranchIds.length) where.branch_id = { in: parsedBranchIds };
  if (parsedSemesters.length) where.semester = { in: parsedSemesters };

  const subjectPairs = await prisma.subject.findMany({
    where,
    select: {
      branch_id: true,
      semester: true,
    },
    distinct: ['branch_id', 'semester'],
  });

  const effectiveDivisions = (
    Array.isArray(divisions) && divisions.length ? divisions : DEFAULT_DIVISIONS
  )
    .map((d) => normalizeDivision(d))
    .filter(Boolean);

  const configs = [];
  for (const pair of subjectPairs) {
    if (pair.branch_id === null || pair.semester === null) continue;

    for (const division of effectiveDivisions) {
      const normalized = normalizeClassConfig({
        branchId: pair.branch_id,
        sem: pair.semester,
        division,
      });
      if (normalized) configs.push(normalized);
    }
  }

  const deduped = new Map();
  for (const config of configs) {
    deduped.set(classKey(config), config);
  }

  return [...deduped.values()];
}

async function generateSchedulesForClasses({ classConfigs, academicYear, createdBy, optimizerRuns = 12 }) {
  const normalized = (Array.isArray(classConfigs) ? classConfigs : [])
    .map((c) => normalizeClassConfig(c))
    .filter(Boolean);

  if (!normalized.length) {
    throw new Error('No valid class configurations were provided.');
  }

  const deduped = new Map();
  for (const c of normalized) deduped.set(classKey(c), c);
  const classes = [...deduped.values()];

  const timeSlots = await loadTimeSlots();
  const subjectsByPair = await loadSubjectsByPair(classes);

  const classesWithSubjects = classes.filter((c) => {
    const key = pairKey(c);
    return (subjectsByPair[key] || []).length > 0;
  });

  const skippedClasses = classes
    .filter((c) => (subjectsByPair[pairKey(c)] || []).length === 0)
    .map((c) => ({ branchId: c.branchId, sem: c.semStr, division: c.division }));

  if (!classesWithSubjects.length) {
    throw new Error('No subjects found for any class. Please add subjects first.');
  }

  const allFaculty = await prisma.faculty.findMany({
    include: { constraints: true },
  });

  if (!allFaculty.length) {
    throw new Error('No faculty found. Please add teachers before generation.');
  }

  const { facultyMap, facultyByName, constraintMap } = createFacultyLookups(allFaculty);

  const rooms = await prisma.room.findMany({
    where: { is_active: 1 },
    orderBy: { room_number: 'asc' },
  });

  if (!rooms.length) {
    throw new Error('No active rooms found. Add rooms before generation.');
  }

  const roomPoolByClass = buildRoomPoolByClass(classesWithSubjects, rooms);

  const { requirements, skippedSubjects } = buildRequirementsForClasses({
    classConfigs: classesWithSubjects,
    subjectsByPair,
    facultyMap,
    facultyByName,
  });

  if (!requirements.length) {
    throw new Error(
      'No schedulable subjects found. Ensure subjects have valid professor assignments.',
    );
  }

  const best = optimizeSchedule({
    requirements,
    classKeys: classesWithSubjects.map((c) => classKey(c)),
    timeSlots,
    constraintMap,
    facultyMap,
    roomPoolByClass,
    attempts: optimizerRuns,
  });

  const classKeys = classesWithSubjects.map((c) => classKey(c));
  const compacted = compactScheduleGrid({
    grid: best.grid,
    classKeys,
    timeSlots,
  });

  await clearExistingTimetables(classesWithSubjects);

  const persisted = await persistSchedule({
    classConfigs: classesWithSubjects,
    grid: compacted.grid,
    timeSlots,
    academicYear,
    createdBy,
  });

  if (persisted.slotsAssigned === 0) {
    throw new Error(
      'Timetable structure was saved but no lectures could be placed. ' +
      'Check subject assignments, time slots, and faculty constraints.',
    );
  }

  return {
    classCount: classesWithSubjects.length,
    skippedClassCount: skippedClasses.length,
    skippedClasses,
    skippedSubjectsCount: skippedSubjects.length,
    days: persisted.daysPersisted,
    slotsAssigned: persisted.slotsAssigned,
    optimization: {
      attempts: best.attemptsTried,
      bestScore: best.score,
      placedLectures: best.placedLectures,
      requiredLectures: best.requiredLectures,
      unplacedLectures: best.unplacedLectures,
      preferredMatches: best.preferredMatches,
      compactMoves: compacted.compactMoves,
    },
  };
}

async function generateSchedule({ branchId, sem, division, academicYear, createdBy }) {
  const result = await generateSchedulesForClasses({
    classConfigs: [{ branchId, sem, division }],
    academicYear,
    createdBy,
    optimizerRuns: 8,
  });

  return {
    days: result.days,
    slotsAssigned: result.slotsAssigned,
    optimization: result.optimization,
  };
}

async function generateAllSchedules({ academicYear, createdBy, divisions, branchIds, semesters, termType }) {
  const classConfigs = await discoverClassConfigs({
    branchIds,
    semesters,
    divisions,
    termType,
  });

  if (!classConfigs.length) {
    throw new Error('No class combinations found from subjects. Add subject data first.');
  }

  return generateSchedulesForClasses({
    classConfigs,
    academicYear,
    createdBy,
    optimizerRuns: 14,
  });
}

module.exports = {
  generateSchedule,
  generateAllSchedules,
};
