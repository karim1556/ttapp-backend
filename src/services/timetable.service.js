'use strict';
/**
 * Timetable Generation Service — v2
 *
 * Generates realistic college timetables matching VPPCOE&VA patterns.
 *
 * Three session types:
 *   1. Whole-Division Lecture — one subject, one faculty, home room
 *   2. Batch-Split Theory — 3 different subjects simultaneously (A/B/C in 3 rooms)
 *   3. Batch-Split Practical — same subject (MinP, SBLC) for A/B/C with different faculty
 *
 * Algorithm phases:
 *   Phase 1: Place batch-split theory rotations (cyclic, 1 per day)
 *   Phase 2: Place batch-split practicals at configured slots
 *   Phase 3: Fill remaining slots with whole-division lectures (scored greedy)
 *
 * All phases enforce:
 *   - No faculty double-booking (across ALL divisions being generated)
 *   - No room double-booking
 *   - Faculty daily/weekly max constraints
 *   - Subject day-spread (avoid clustering)
 */

const prisma = require('../config/prisma');

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_DIVISIONS = ['A', 'B'];
const DEFAULT_SEMESTER_WEEKS = 16;
const BATCHES = ['A', 'B', 'C'];

const DEFAULT_TIME_SLOTS = [
  { startTimeHr: 9,  startTimeMinutes: 0,  endTimeHr: 10, endTimeMinutes: 0,  is_break: 0 },
  { startTimeHr: 10, startTimeMinutes: 0,  endTimeHr: 11, endTimeMinutes: 0,  is_break: 0 },
  { startTimeHr: 11, startTimeMinutes: 0,  endTimeHr: 11, endTimeMinutes: 20, is_break: 1 },
  { startTimeHr: 11, startTimeMinutes: 20, endTimeHr: 12, endTimeMinutes: 20, is_break: 0 },
  { startTimeHr: 12, startTimeMinutes: 20, endTimeHr: 13, endTimeMinutes: 20, is_break: 0 },
  { startTimeHr: 13, startTimeMinutes: 20, endTimeHr: 14, endTimeMinutes: 0,  is_break: 1 },
  { startTimeHr: 14, startTimeMinutes: 0,  endTimeHr: 15, endTimeMinutes: 0,  is_break: 0 },
  { startTimeHr: 15, startTimeMinutes: 0,  endTimeHr: 16, endTimeMinutes: 0,  is_break: 0 },
  { startTimeHr: 16, startTimeMinutes: 0,  endTimeHr: 17, endTimeMinutes: 0,  is_break: 0 },
];

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function parseJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
}

function parseFiniteInt(v) {
  return v == null || v === '' ? null : (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : null);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeDivision(d) { return String(d || '').trim().toUpperCase(); }
function classKey(c) { return `${c.branchId}_${c.semStr}_${c.division}`; }
function pairKey(c) { return `${c.branchId}_${c.semStr}`; }
function getBaseLabCode(code) { return (code || '').replace(/-(A|B|C)$/, ''); }

function normalizeClassConfig(raw) {
  const branchId = parseInt(raw?.branchId, 10);
  const semNum = parseInt(raw?.sem ?? raw?.semester, 10);
  const division = normalizeDivision(raw?.division);
  if (Number.isNaN(branchId) || Number.isNaN(semNum) || !division) return null;
  return { branchId, sem: semNum, semStr: String(semNum), division };
}

function resolveSubjectWeeklyHours(subject) {
  const dw = parseFiniteInt(subject?.weekly_hours);
  if (dw && dw > 0) return dw;
  const sh = parseFiniteInt(subject?.semester_hours);
  if (sh && sh > 0) return Math.max(1, Math.ceil(sh / DEFAULT_SEMESTER_WEEKS));
  const c = subject?.totalcredits ? Number(subject.totalcredits) : null;
  if (c && c > 0) return Math.ceil(c);
  return 1;
}

function resolveSemestersFromTermType(termType) {
  const t = String(termType || '').trim().toLowerCase();
  if (t === 'even') return [2, 4, 6, 8];
  if (t === 'odd') return [1, 3, 5, 7];
  return null;
}

// ─── Time Slot Helpers ────────────────────────────────────────────────────────

async function loadTimeSlots(branchId = null, semester = null, division = null) {
  try {
    let dbSlots = [];
    if (branchId && semester && division) {
      dbSlots = await prisma.timeSlotTemplate.findMany({
        where: { is_active: 1, branch_id: branchId, semester: parseInt(semester, 10), division: division },
        orderBy: [{ sort_order: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
      });
    }
    if (!dbSlots.length && branchId && semester) {
      dbSlots = await prisma.timeSlotTemplate.findMany({
        where: { is_active: 1, branch_id: branchId, semester: parseInt(semester, 10), division: null },
        orderBy: [{ sort_order: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
      });
    }
    if (!dbSlots.length && branchId) {
      dbSlots = await prisma.timeSlotTemplate.findMany({
        where: { is_active: 1, branch_id: branchId, semester: null, division: null },
        orderBy: [{ sort_order: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
      });
    }
    if (!dbSlots.length) {
      dbSlots = await prisma.timeSlotTemplate.findMany({
        where: { is_active: 1, branch_id: null },
        orderBy: [{ sort_order: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
      });
    }
    const nonBreakSlots = dbSlots.filter(s => !s.is_break);
    if (nonBreakSlots.length >= 5) return dbSlots;
  } catch (_) {}
  return DEFAULT_TIME_SLOTS;
}

function getNonBreakSlotIndices(timeSlots) {
  return timeSlots.reduce((acc, s, i) => { if (!s.is_break) acc.push(i); return acc; }, []);
}

// ─── Faculty Helpers ──────────────────────────────────────────────────────────

function createFacultyLookups(allFaculty) {
  const facultyMap = {}, facultyByName = {}, constraintMap = {};
  for (const f of allFaculty) {
    facultyMap[f.faculty_id] = f;
    if (f.name) facultyByName[String(f.name).toLowerCase().trim()] = f.faculty_id;
    if (f.constraints) constraintMap[f.faculty_id] = f.constraints;
  }
  return { facultyMap, facultyByName, constraintMap };
}

function resolveFacultyId(professorAssign, facultyMap, facultyByName) {
  if (!professorAssign) return null;
  const asInt = parseInt(professorAssign, 10);
  if (!Number.isNaN(asInt) && facultyMap[asInt]) return asInt;
  const byName = String(professorAssign).toLowerCase().trim();
  return facultyByName[byName] ?? null;
}

function getSlotHour(s) {
  const h = s?.startHour ?? s?.start_hour ?? s?.hour;
  const p = parseInt(h, 10);
  return Number.isNaN(p) ? null : p;
}

function isUnavailable(constraint, day, startHour) {
  return parseJson(constraint?.unavailable_slots).some(s => s?.day === day && getSlotHour(s) === startHour);
}

function isPreferredSlot(constraint, day, startHour) {
  return parseJson(constraint?.preferred_slots).some(s => s?.day === day && getSlotHour(s) === startHour);
}

// ─── Room Helpers ─────────────────────────────────────────────────────────────

function buildRoomPools(rooms) {
  const active = (rooms || []).filter(r => (r?.is_active ?? 1) !== 0);
  return {
    all: active,
    regular: active.filter(r => {
      const t = String(r?.room_type || 'Classroom').trim().toLowerCase();
      return t !== 'lab' && t !== 'laboratory';
    }),
    labs: active.filter(r => {
      const t = String(r?.room_type || '').trim().toLowerCase();
      return t === 'lab' || t === 'laboratory';
    }),
  };
}

// ─── Requirements Builder ─────────────────────────────────────────────────────

async function loadSubjectsByPair(classConfigs) {
  const uniquePairs = new Map();
  for (const c of classConfigs) uniquePairs.set(pairKey(c), { branchId: c.branchId, sem: c.sem, semStr: c.semStr });
  const byPair = {};
  await Promise.all([...uniquePairs.values()].map(async p => {
    byPair[`${p.branchId}_${p.semStr}`] = await prisma.subject.findMany({ where: { branch_id: p.branchId, semester: p.sem } });
  }));
  return byPair;
}

/**
 * Classify subjects into theory subjects and practical batch-groups for each class.
 *
 * Returns per classKey:
 *   theorySubjects: [{ subject, facultyId, weeklyHours }]
 *   practicalGroups: [{ baseCode, batchAssignments: [{subject, facultyId, batchCode}], weeklyHours }]
 */
function buildRequirementsForClasses({ classConfigs, subjectsByPair, facultyMap, facultyByName }) {
  const theoryByClass = {};
  const projectLabGroupsByClass = {};
  const rotatedLabGroupsByClass = {};
  const skippedSubjects = [];

  for (const config of classConfigs) {
    const pk = pairKey(config);
    const ck = classKey(config);
    const subjects = (subjectsByPair[pk] || []).filter(s => !s.division || s.division === config.division);
    const labGroups = {};
    const theoryList = [];

    for (const subj of subjects) {
      if (subj.ispractical === 'Yes' && subj.batch) {
        const base = getBaseLabCode(subj.subject_code);
        if (!labGroups[base]) labGroups[base] = {};
        labGroups[base][subj.batch] = subj;
      } else {
        theoryList.push(subj);
      }
    }

    // Build theory requirements
    const theories = [];
    for (const subj of theoryList) {
      const wh = resolveSubjectWeeklyHours(subj);
      const fid = resolveFacultyId(subj.professor_assign, facultyMap, facultyByName);
      if (!fid) {
        skippedSubjects.push({ branchId: config.branchId, sem: config.semStr, division: config.division, subjectCode: subj.subject_code, reason: 'no_faculty' });
        continue;
      }
      theories.push({ subject: subj, facultyId: fid, weeklyHours: Math.max(1, wh), classKey: ck });
    }
    theoryByClass[ck] = theories;

    // Build practical batch groups
    const projectLabGroups = [];
    const rotatedLabGroups = [];
    for (const [baseCode, batchMap] of Object.entries(labGroups)) {
      const batchSubjects = BATCHES.map(b => batchMap[b]).filter(Boolean);
      if (batchSubjects.length < 3) {
        for (const bs of batchSubjects) skippedSubjects.push({ branchId: config.branchId, sem: config.semStr, division: config.division, subjectCode: bs.subject_code, reason: 'incomplete_batches' });
        continue;
      }
      const batchAssignments = batchSubjects.map((bs, i) => ({
        subject: bs,
        facultyId: resolveFacultyId(bs.professor_assign, facultyMap, facultyByName),
        batchCode: BATCHES[i],
      }));
      if (!batchAssignments.every(ba => ba.facultyId)) {
        for (const ba of batchAssignments) {
          if (!ba.facultyId) skippedSubjects.push({ branchId: config.branchId, sem: config.semStr, division: config.division, subjectCode: ba.subject.subject_code, reason: 'no_faculty' });
        }
        continue;
      }
      const wh = resolveSubjectWeeklyHours(batchSubjects[0]);
      
      const isProjectLab = /minp|sblc|mini|project/i.test(baseCode);
      const groupData = { baseCode, batchAssignments, weeklyHours: Math.max(1, wh), classKey: ck };
      
      if (isProjectLab) {
        projectLabGroups.push(groupData);
      } else {
        rotatedLabGroups.push(groupData);
      }
    }
    projectLabGroupsByClass[ck] = projectLabGroups;
    rotatedLabGroupsByClass[ck] = rotatedLabGroups;
  }

  return { theoryByClass, projectLabGroupsByClass, rotatedLabGroupsByClass, skippedSubjects };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCHEDULING ALGORITHM
// ═══════════════════════════════════════════════════════════════════════════════

function buildCandidateSchedule({
  theoryByClass, projectLabGroupsByClass, rotatedLabGroupsByClass, classKeys, timeSlots, constraintMap,
  facultyMap, roomPools, classSlotConfig, attemptIndex,
}) {
  const nonBreakIndices = getNonBreakSlotIndices(timeSlots);

  // ── Global tracking (shared across ALL divisions) ────────────────────────
  const facultySlotUsage = {};   // `${fid}_${day}_${slotIdx}` → true
  const roomSlotUsage = {};      // `${day}_${slotIdx}_${roomId}` → true
  const facultyDayCount = {};    // `${fid}_${day}` → count
  const facultyWeekCount = {};   // `${fid}` → count
  let preferredMatches = 0;

  // ── Per-class grid ───────────────────────────────────────────────────────
  const grid = {};
  for (const ck of classKeys) {
    grid[ck] = {};
    for (const d of DAYS) grid[ck][d] = new Array(timeSlots.length).fill(null);
  }

  // ── Per-class tracking ───────────────────────────────────────────────────
  const subjectDayCount = {};  // `${ck}_${subjectCode}_${day}` → count

  // ── Helper: Check & record faculty usage ─────────────────────────────────
  function isFacultyFree(fid, day, slotIdx) {
    return !facultySlotUsage[`${fid}_${day}_${slotIdx}`];
  }

  function isFacultyAvailable(fid, day, slotIdx) {
    if (!isFacultyFree(fid, day, slotIdx)) return false;
    const constraint = constraintMap[fid];
    if (isUnavailable(constraint, day, timeSlots[slotIdx].startTimeHr)) return false;
    const dk = `${fid}_${day}`;
    const maxPerDay = constraint?.max_lectures_per_day ?? 5;
    if ((facultyDayCount[dk] ?? 0) >= maxPerDay) return false;
    const maxPerWeek = parseFiniteInt(facultyMap?.[fid]?.weekly_work_hours) ?? 22;
    if ((facultyWeekCount[fid] ?? 0) >= maxPerWeek) return false;
    return true;
  }

  function recordFacultyUsage(fid, day, slotIdx) {
    facultySlotUsage[`${fid}_${day}_${slotIdx}`] = true;
    const dk = `${fid}_${day}`;
    facultyDayCount[dk] = (facultyDayCount[dk] ?? 0) + 1;
    facultyWeekCount[fid] = (facultyWeekCount[fid] ?? 0) + 1;
    if (isPreferredSlot(constraintMap[fid], day, timeSlots[slotIdx].startTimeHr)) preferredMatches += 1;
  }

  function isRoomFree(roomId, day, slotIdx) {
    return !roomSlotUsage[`${day}_${slotIdx}_${roomId}`];
  }

  function recordRoomUsage(roomId, day, slotIdx) {
    roomSlotUsage[`${day}_${slotIdx}_${roomId}`] = true;
  }

  function findFreeRoom(pool, day, slotIdx, excludeIds = new Set()) {
    for (const r of pool) {
      if (excludeIds.has(r.id)) continue;
      if (isRoomFree(r.id, day, slotIdx)) return r;
    }
    return null;
  }

  function recordSubjectDay(ck, subjectCode, day) {
    const k = `${ck}_${subjectCode}_${day}`;
    subjectDayCount[k] = (subjectDayCount[k] ?? 0) + 1;
  }

  function getSubjectDayCount(ck, subjectCode, day) {
    return subjectDayCount[`${ck}_${subjectCode}_${day}`] ?? 0;
  }

  function isFacultyAvailableForBlock(fid, day, slotIdx1, slotIdx2) {
    if (!isFacultyFree(fid, day, slotIdx1) || !isFacultyFree(fid, day, slotIdx2)) return false;
    const constraint = constraintMap[fid];
    if (isUnavailable(constraint, day, timeSlots[slotIdx1].startTimeHr)) return false;
    if (isUnavailable(constraint, day, timeSlots[slotIdx2].startTimeHr)) return false;
    const dk = `${fid}_${day}`;
    const maxPerDay = constraint?.max_lectures_per_day ?? 5;
    if ((facultyDayCount[dk] ?? 0) + 2 > maxPerDay) return false;
    const maxPerWeek = parseFiniteInt(facultyMap?.[fid]?.weekly_work_hours) ?? 22;
    if ((facultyWeekCount[fid] ?? 0) + 2 > maxPerWeek) return false;
    return true;
  }

  // Room must be free in both slots of the block
  function findFreeRoomForBlock(pool, day, slotIdx1, slotIdx2, excludeIds = new Set()) {
    for (const r of pool) {
      if (excludeIds.has(r.id)) continue;
      if (isRoomFree(r.id, day, slotIdx1) && isRoomFree(r.id, day, slotIdx2)) return r;
    }
    return null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 1: Batch-Split Lab Rotations
  //   Supports lab_duration_slots=1 (1-hr single slot) or =2 (2-hr block)
  //   Uses lab rooms when available, falls back to all rooms.
  // ═════════════════════════════════════════════════════════════════════════

  const batchSplitPlaced = {};   // `${ck}` → count
  const scheduledBatches = {};   // `${ck}_${baseCode}` → Set('A','B','C')
  const labRoomPool = roomPools.labs.length ? roomPools.labs : roomPools.all;

  for (const ck of classKeys) {
    batchSplitPlaced[ck] = 0;
    const config = classSlotConfig[ck] || {};
    const batchSplitEnabled = config.batch_split_enabled !== 0;
    const batchSplitSlotIdx = config.batch_split_slot_index ?? 3;
    const labDuration = config.lab_duration_slots ?? 2;  // 1 = single slot, 2 = two-hour block
    const rotatedGroups = rotatedLabGroupsByClass[ck] || [];

    if (!batchSplitEnabled || rotatedGroups.length < 3) continue;
    if (batchSplitSlotIdx < 0 || batchSplitSlotIdx >= timeSlots.length || timeSlots[batchSplitSlotIdx].is_break) continue;

    // For 2-hr block, ensure next slot is also non-break
    const nextSlotIdx = batchSplitSlotIdx + 1;
    if (labDuration === 2 && (nextSlotIdx >= timeSlots.length || timeSlots[nextSlotIdx].is_break)) continue;

    // Initialize scheduled tracker
    for (const group of rotatedGroups) {
      scheduledBatches[`${ck}_${group.baseCode}`] = new Set();
    }

    // Schedule across the days
    for (let di = 0; di < DAYS.length; di++) {
      const day = DAYS[di];
      const dg = grid[ck][day];

      // Check the target slot is free
      if (dg[batchSplitSlotIdx] !== null) continue;
      if (labDuration === 2 && dg[nextSlotIdx] !== null) continue;

      // Pick 3 eligible groups that still have unscheduled batches
      const shuffledGroups = attemptIndex % 2 === 0 ? [...rotatedGroups] : shuffleArray([...rotatedGroups]);
      const eligibleGroups = shuffledGroups.filter(g => scheduledBatches[`${ck}_${g.baseCode}`].size < 3);
      if (eligibleGroups.length < 3) continue;

      const g1 = eligibleGroups[0];
      const g2 = eligibleGroups[1];
      const g3 = eligibleGroups[2];

      const batchPermutations = [
        ['A','B','C'], ['A','C','B'], ['B','A','C'],
        ['B','C','A'], ['C','A','B'], ['C','B','A'],
      ];
      const shuffledPerms = shuffleArray(batchPermutations);

      let placed = false;
      for (const [b1, b2, b3] of shuffledPerms) {
        const sched1 = scheduledBatches[`${ck}_${g1.baseCode}`];
        const sched2 = scheduledBatches[`${ck}_${g2.baseCode}`];
        const sched3 = scheduledBatches[`${ck}_${g3.baseCode}`];

        if (sched1.has(b1) || sched2.has(b2) || sched3.has(b3)) continue;

        const ba1 = g1.batchAssignments.find(ba => ba.batchCode === b1);
        const ba2 = g2.batchAssignments.find(ba => ba.batchCode === b2);
        const ba3 = g3.batchAssignments.find(ba => ba.batchCode === b3);
        if (!ba1 || !ba2 || !ba3) continue;

        // Check faculty availability
        if (labDuration === 2) {
          if (!isFacultyAvailableForBlock(ba1.facultyId, day, batchSplitSlotIdx, nextSlotIdx)) continue;
          if (!isFacultyAvailableForBlock(ba2.facultyId, day, batchSplitSlotIdx, nextSlotIdx)) continue;
          if (!isFacultyAvailableForBlock(ba3.facultyId, day, batchSplitSlotIdx, nextSlotIdx)) continue;
        } else {
          if (!isFacultyAvailable(ba1.facultyId, day, batchSplitSlotIdx)) continue;
          if (!isFacultyAvailable(ba2.facultyId, day, batchSplitSlotIdx)) continue;
          if (!isFacultyAvailable(ba3.facultyId, day, batchSplitSlotIdx)) continue;
        }

        // Find 3 free lab rooms
        const usedRooms = new Set();
        const findRoom = (idx1, idx2) => {
          for (const r of labRoomPool) {
            if (usedRooms.has(r.id)) continue;
            if (labDuration === 2) {
              if (isRoomFree(r.id, day, idx1) && isRoomFree(r.id, day, idx2)) return r;
            } else {
              if (isRoomFree(r.id, day, idx1)) return r;
            }
          }
          return null;
        };

        const r1 = findRoom(batchSplitSlotIdx, nextSlotIdx);
        if (!r1) continue;
        usedRooms.add(r1.id);
        const r2 = findRoom(batchSplitSlotIdx, nextSlotIdx);
        if (!r2) continue;
        usedRooms.add(r2.id);
        const r3 = findRoom(batchSplitSlotIdx, nextSlotIdx);
        if (!r3) continue;

        // Place the batch split
        const labBatchAssignments = [
          { subject: ba1.subject, facultyId: ba1.facultyId, batchCode: b1, roomId: r1.id, roomNumber: r1.room_number, isPractical: true, isBatchSplit: true },
          { subject: ba2.subject, facultyId: ba2.facultyId, batchCode: b2, roomId: r2.id, roomNumber: r2.room_number, isPractical: true, isBatchSplit: true },
          { subject: ba3.subject, facultyId: ba3.facultyId, batchCode: b3, roomId: r3.id, roomNumber: r3.room_number, isPractical: true, isBatchSplit: true },
        ];
        const baseAssignment = { isBatchSplit: true, isPractical: true, labBatchAssignments };

        dg[batchSplitSlotIdx] = baseAssignment;
        if (labDuration === 2) {
          dg[nextSlotIdx] = { ...baseAssignment, _labSecond: true };
        }

        // Record usages
        for (const [fid, r, slotIdx] of [
          [ba1.facultyId, r1, batchSplitSlotIdx],
          [ba2.facultyId, r2, batchSplitSlotIdx],
          [ba3.facultyId, r3, batchSplitSlotIdx],
        ]) {
          recordFacultyUsage(fid, day, slotIdx);
          recordRoomUsage(r.id, day, slotIdx);
          if (labDuration === 2) {
            recordFacultyUsage(fid, day, nextSlotIdx);
            recordRoomUsage(r.id, day, nextSlotIdx);
          }
        }

        recordSubjectDay(ck, ba1.subject.subject_code, day);
        recordSubjectDay(ck, ba2.subject.subject_code, day);
        recordSubjectDay(ck, ba3.subject.subject_code, day);

        sched1.add(b1); sched2.add(b2); sched3.add(b3);
        batchSplitPlaced[ck] = (batchSplitPlaced[ck] || 0) + 1;
        placed = true;
        break;
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 2: Batch-Split Project Labs (MinP — same subject for all batches in parallel)
  //   Always 2-hour block. Uses lab rooms.
  // ═════════════════════════════════════════════════════════════════════════

  const practicalPlaced = {};

  for (const ck of classKeys) {
    practicalPlaced[ck] = 0;
    const config = classSlotConfig[ck] || {};
    const practicalSlotIdx = config.lab_slot_index ?? 6;
    const nextPracticalSlotIdx = practicalSlotIdx + 1;
    const projectGroups = projectLabGroupsByClass[ck] || [];

    if (!projectGroups.length) continue;
    if (practicalSlotIdx < 0 || practicalSlotIdx >= timeSlots.length || timeSlots[practicalSlotIdx].is_break) continue;
    if (nextPracticalSlotIdx >= timeSlots.length || timeSlots[nextPracticalSlotIdx].is_break) continue;

    for (const group of projectGroups) {
      let placed = 0;
      const daysOrder = attemptIndex % 2 === 0 ? [...DAYS] : shuffleArray([...DAYS]);

      for (const day of daysOrder) {
        if (placed >= group.weeklyHours) break;
        const dg = grid[ck][day];
        if (dg[practicalSlotIdx] !== null || dg[nextPracticalSlotIdx] !== null) continue;

        let allOk = true;
        const usedRooms = new Set();
        const placements = [];

        for (const ba of group.batchAssignments) {
          if (!isFacultyAvailableForBlock(ba.facultyId, day, practicalSlotIdx, nextPracticalSlotIdx)) { allOk = false; break; }
          const room = findFreeRoomForBlock(labRoomPool, day, practicalSlotIdx, nextPracticalSlotIdx, usedRooms);
          if (!room) { allOk = false; break; }
          usedRooms.add(room.id);
          placements.push({ ...ba, room });
        }

        if (!allOk || placements.length < 3) continue;

        const labBatchAssignments = placements.map(p => ({
          subject: p.subject, facultyId: p.facultyId, batchCode: p.batchCode,
          roomId: p.room.id, roomNumber: p.room.room_number, isPractical: true, isBatchSplit: true,
        }));
        const baseAssignment = { isBatchSplit: true, isPractical: true, labBatchAssignments };
        dg[practicalSlotIdx] = baseAssignment;
        dg[nextPracticalSlotIdx] = { ...baseAssignment, _labSecond: true };

        for (const p of placements) {
          recordFacultyUsage(p.facultyId, day, practicalSlotIdx);
          recordFacultyUsage(p.facultyId, day, nextPracticalSlotIdx);
          recordRoomUsage(p.room.id, day, practicalSlotIdx);
          recordRoomUsage(p.room.id, day, nextPracticalSlotIdx);
          recordSubjectDay(ck, p.subject.subject_code, day);
        }
        placed += 2;
        practicalPlaced[ck] = (practicalPlaced[ck] || 0) + 1;
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 3: Whole-Division Lectures (scored greedy)
  // ═════════════════════════════════════════════════════════════════════════

  // Build lecture requirements with tracking
  const lectureReqs = [];
  for (const ck of classKeys) {
    const theories = theoryByClass[ck] || [];
    for (const t of theories) {
      lectureReqs.push({
        classKey: ck,
        subject: t.subject,
        facultyId: t.facultyId,
        lecturesNeeded: t.weeklyHours,
        lecturesAssigned: 0,
      });
    }
  }

  // Sort by most-needed first, then shuffle within same priority for variety
  const sortedReqs = attemptIndex % 3 === 0
    ? lectureReqs.sort((a, b) => b.lecturesNeeded - a.lecturesNeeded)
    : shuffleArray(lectureReqs).sort((a, b) => {
        const ra = b.lecturesNeeded - b.lecturesAssigned;
        const rb = a.lecturesNeeded - a.lecturesAssigned;
        return ra - rb;
      });

  // Iteratively place lectures
  let anyPlaced = true;
  while (anyPlaced) {
    anyPlaced = false;

    // Re-sort by remaining need
    sortedReqs.sort((a, b) => {
      const remA = a.lecturesNeeded - a.lecturesAssigned;
      const remB = b.lecturesNeeded - b.lecturesAssigned;
      return remB - remA;
    });

    for (const req of sortedReqs) {
      if (req.lecturesAssigned >= req.lecturesNeeded) continue;

      const ck = req.classKey;
      const config = classSlotConfig[ck] || {};
      const homeRoom = config.home_room || null;
      const fid = req.facultyId;

      let best = null;

      for (const day of DAYS) {
        const dg = grid[ck][day];

        for (const slotIdx of nonBreakIndices) {
          if (dg[slotIdx] !== null) continue;

          // Hard constraints
          if (!isFacultyAvailable(fid, day, slotIdx)) continue;

          // Find room — prefer home room
          let room = null;
          if (homeRoom) {
            const homeRoomObj = roomPools.regular.find(r => r.room_number === homeRoom);
            if (homeRoomObj && isRoomFree(homeRoomObj.id, day, slotIdx)) {
              room = homeRoomObj;
            }
          }
          if (!room) {
            room = findFreeRoom(roomPools.regular.length ? roomPools.regular : roomPools.all, day, slotIdx);
          }
          if (!room) continue;

          // Score this placement
          let score = 50 + Math.random() * 2;

          // Prefer home room
          if (room.room_number === homeRoom) score += 8;

          // Preferred slot bonus
          if (isPreferredSlot(constraintMap[fid], day, timeSlots[slotIdx].startTimeHr)) score += 12;

          // Penalize same subject on same day (spread across week)
          const dayCount = getSubjectDayCount(ck, req.subject.subject_code, day);
          score -= dayCount * 30;

          // Penalize faculty overload on this day
          const facDayLoad = facultyDayCount[`${fid}_${day}`] ?? 0;
          score -= facDayLoad * 4;

          // Penalize faculty weekly overload
          const facWeekLoad = facultyWeekCount[fid] ?? 0;
          score -= facWeekLoad * 0.5;

          // Count how many lectures this class already has today
          const classLecturesToday = nonBreakIndices.filter(si => dg[si] !== null).length;
          // Bonus for days with fewer lectures (spread evenly across the week)
          score += Math.max(0, 5 - classLecturesToday) * 4;
          // Penalize putting more than 5 whole-div lectures per day
          if (classLecturesToday >= 5) score -= 15;

          // Prefer compactness — strong bonus if adjacent slots are filled
          const prevSlot = slotIdx > 0 ? dg[slotIdx - 1] : null;
          const nextSlot = slotIdx + 1 < timeSlots.length ? dg[slotIdx + 1] : null;
          if (prevSlot) score += 6;
          if (nextSlot) score += 6;
          // Penalty for isolated slots

          if (!prevSlot && !nextSlot) score -= 2;

          // Slight preference for earlier slots
          score -= slotIdx * 0.5;

          if (!best || score > best.score) {
            best = { day, slotIdx, score, room };
          }
        }
      }

      if (!best) continue;

      // Place the lecture — use classroom rooms for theory, never lab rooms
      const classroomPool = roomPools.regular.length ? roomPools.regular : roomPools.all;
      const { day, slotIdx } = best;
      const dg = grid[ck][day];
      // Re-find room with fresh check (best.room may have been taken since scoring)
      let finalRoom = null;
      if (homeRoom) {
        const hr = classroomPool.find(r => r.room_number === homeRoom);
        if (hr && isRoomFree(hr.id, day, slotIdx)) finalRoom = hr;
      }
      if (!finalRoom) finalRoom = findFreeRoom(classroomPool, day, slotIdx);
      if (!finalRoom) continue;

      dg[slotIdx] = {
        isBatchSplit: false,
        isPractical: false,
        subject: req.subject,
        facultyId: req.facultyId,
        roomId: finalRoom.id,
        roomNumber: finalRoom.room_number,
      };

      recordFacultyUsage(req.facultyId, day, slotIdx);
      recordRoomUsage(finalRoom.id, day, slotIdx);
      recordSubjectDay(ck, req.subject.subject_code, day);
      req.lecturesAssigned += 1;
      anyPlaced = true;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCORING
  // ═════════════════════════════════════════════════════════════════════════

  const totalNeeded = lectureReqs.reduce((s, r) => s + r.lecturesNeeded, 0);
  const totalPlaced = lectureReqs.reduce((s, r) => s + r.lecturesAssigned, 0);
  const unplaced = totalNeeded - totalPlaced;

  // Count batch-splits and practicals
  let batchSplitTotal = 0, practicalTotal = 0;
  for (const ck of classKeys) {
    batchSplitTotal += batchSplitPlaced[ck] || 0;
    practicalTotal += practicalPlaced[ck] || 0;
  }

  // Faculty load imbalance penalty
  const loads = Object.values(facultyWeekCount);
  let imbalance = 0;
  if (loads.length > 1) imbalance = (Math.max(...loads) - Math.min(...loads)) * 1.5;

  // Same-subject-on-same-day penalty
  let sameSubjectPenalty = 0;
  for (const key of Object.keys(subjectDayCount)) {
    if (subjectDayCount[key] > 1) sameSubjectPenalty += (subjectDayCount[key] - 1) * 15;
  }

  const score =
    totalPlaced * 100
    + batchSplitTotal * 50
    + practicalTotal * 50
    - unplaced * 500
    - imbalance
    + preferredMatches * 10
    - sameSubjectPenalty;

  return {
    grid, score,
    placedLectures: totalPlaced,
    requiredLectures: totalNeeded,
    unplacedLectures: unplaced,
    batchSplitSessions: batchSplitTotal,
    practicalSessions: practicalTotal,
    preferredMatches,
  };
}

// ─── Optimizer ────────────────────────────────────────────────────────────────

function optimizeSchedule(params) {
  const totalAttempts = Math.max(1, parseInt(params.attempts, 10) || 1);
  let best = null;
  for (let i = 0; i < totalAttempts; i++) {
    const candidate = buildCandidateSchedule({ ...params, attemptIndex: i });
    if (!best || candidate.score > best.score) best = candidate;
    if (best.unplacedLectures === 0 && i >= 3) break;
  }
  return { ...best, attemptsTried: totalAttempts };
}

// ─── Persistence Layer ────────────────────────────────────────────────────────

function expandBatchAssignments(assignment) {
  if (!assignment) return [];
  if (assignment.isBatchSplit && Array.isArray(assignment.labBatchAssignments)) {
    return assignment.labBatchAssignments;
  }
  return [assignment];
}

async function clearExistingTimetables(classConfigs) {
  if (!classConfigs.length) return;
  const filters = classConfigs.map(c => ({ branch_id: c.branchId, sem: c.semStr, division: c.division }));
  const existingTT = await prisma.tblTimeTable.findMany({ where: { OR: filters }, select: { id: true } });
  if (!existingTT.length) return;
  const ttIds = existingTT.map(t => t.id);
  const detailRows = await prisma.timeTimeDetailed.findMany({ where: { timetable_id: { in: ttIds } }, select: { id: true } });
  const detailIds = detailRows.map(d => d.id);
  if (detailIds.length) {
    await prisma.timeTableBatchSubject.deleteMany({ where: { time_table_detailed_id: { in: detailIds } } });
    await prisma.timeTimeDetailed.deleteMany({ where: { id: { in: detailIds } } });
  }
  await prisma.tblTimeTable.deleteMany({ where: { id: { in: ttIds } } });
}

async function persistSchedule({ classConfigs, grid, timeSlots, academicYear, createdBy }) {
  const createdByBig = createdBy ? BigInt(createdBy) : null;
  let slotsAssigned = 0, daysPersisted = 0;

  for (const config of classConfigs) {
    const ck = classKey(config);
    for (const day of DAYS) {
      const ttRow = await prisma.tblTimeTable.create({
        data: {
          dateOfWeek: day, branch_id: config.branchId, sem: config.semStr,
          division: config.division, academic_id: academicYear ? parseInt(academicYear, 10) : null,
          createdBy: createdByBig,
        },
      });
      daysPersisted += 1;

      for (let si = 0; si < timeSlots.length; si++) {
        const sd = timeSlots[si];
        const dr = await prisma.timeTimeDetailed.create({
          data: {
            timetable_id: ttRow.id,
            startTimeHr: sd.startTimeHr, startTimeMinutes: sd.startTimeMinutes,
            endTimeHr: sd.endTimeHr, endTimeMinutes: sd.endTimeMinutes,
            createdBy: createdByBig,
          },
        });

        const assignment = grid[ck]?.[day]?.[si];
        if (!assignment) continue;

        const rows = expandBatchAssignments(assignment);
        for (const row of rows) {
          await prisma.timeTableBatchSubject.create({
            data: {
              time_table_detailed_id: dr.id,
              typeOfLecture: row.isBatchSplit ? 'Lab' : 'Lecture',
              subjectCode: row.subject?.subject_code || row.subjectCode || null,
              facultyid: row.facultyId ? BigInt(row.facultyId) : null,
              room_number: row.roomNumber || row.room_number || null,
              batch: row.isBatchSplit ? (row.batchCode || row.batch || null) : null,
              createdBy: createdByBig,
            },
          });
          slotsAssigned += 1;
        }
      }
    }
  }

  return { daysPersisted, slotsAssigned };
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function generateSchedulesForClasses({ classConfigs, academicYear, createdBy, optimizerRuns = 20 }) {
  const normalized = (Array.isArray(classConfigs) ? classConfigs : []).map(c => normalizeClassConfig(c)).filter(Boolean);
  if (!normalized.length) throw new Error('No valid class configurations provided.');

  const deduped = new Map();
  for (const c of normalized) deduped.set(classKey(c), c);
  const classes = [...deduped.values()];

  // Use the branch ID, semester, and division of the first class config for slot loading
  const branchIdForSlots = classes[0]?.branchId ?? null;
  const semesterForSlots = classes[0]?.sem ?? null;
  const divisionForSlots = classes[0]?.division ?? null;
  const timeSlots = await loadTimeSlots(branchIdForSlots, semesterForSlots, divisionForSlots);
  const subjectsByPair = await loadSubjectsByPair(classes);
  const classesWithSubjects = classes.filter(c => (subjectsByPair[pairKey(c)] || []).length > 0);
  const skippedClasses = classes.filter(c => (subjectsByPair[pairKey(c)] || []).length === 0)
    .map(c => ({ branchId: c.branchId, sem: c.semStr, division: c.division }));

  if (!classesWithSubjects.length) throw new Error('No subjects found for any class.');

  const allFaculty = await prisma.faculty.findMany({ include: { constraints: true } });
  if (!allFaculty.length) throw new Error('No faculty found.');
  const { facultyMap, facultyByName, constraintMap } = createFacultyLookups(allFaculty);

  const rooms = await prisma.room.findMany({ where: { is_active: 1 }, orderBy: { room_number: 'asc' } });
  if (!rooms.length) throw new Error('No active rooms found.');
  const roomPools = buildRoomPools(rooms);

  // Load per-division slot configuration
  const classSlotConfig = {};
  try {
    const classSlots = await prisma.classLabSlot.findMany({
      where: academicYear ? { academic_year: academicYear } : {},
    });
    for (const cls of classSlots) {
      const key = `${cls.branch_id}_${cls.semester}_${cls.division}`;
      classSlotConfig[key] = {
        lab_slot_index: cls.lab_slot_index,
        batch_split_slot_index: cls.batch_split_slot_index,
        batch_split_enabled: cls.batch_split_enabled,
        home_room: cls.home_room || null,
      };
    }
  } catch (_) {}

  const { theoryByClass, projectLabGroupsByClass, rotatedLabGroupsByClass, skippedSubjects } = buildRequirementsForClasses({
    classConfigs: classesWithSubjects, subjectsByPair, facultyMap, facultyByName,
  });

  const allClassKeys = classesWithSubjects.map(c => classKey(c));

  // Check we have something to schedule
  const hasTheory = allClassKeys.some(ck => (theoryByClass[ck] || []).length > 0);
  const hasProjectLab = allClassKeys.some(ck => (projectLabGroupsByClass[ck] || []).length > 0);
  const hasRotatedLab = allClassKeys.some(ck => (rotatedLabGroupsByClass[ck] || []).length > 0);
  if (!hasTheory && !hasProjectLab && !hasRotatedLab) throw new Error('No schedulable subjects found.');

  const best = optimizeSchedule({
    theoryByClass, projectLabGroupsByClass, rotatedLabGroupsByClass,
    classKeys: allClassKeys, timeSlots, constraintMap, facultyMap,
    roomPools, classSlotConfig, attempts: optimizerRuns,
  });

  await clearExistingTimetables(classesWithSubjects);
  const persisted = await persistSchedule({
    classConfigs: classesWithSubjects, grid: best.grid, timeSlots, academicYear, createdBy,
  });

  if (persisted.slotsAssigned === 0) throw new Error('Timetable structure saved but no lectures placed.');

  return {
    classCount: classesWithSubjects.length,
    skippedClassCount: skippedClasses.length,
    skippedClasses,
    skippedSubjectsCount: skippedSubjects.length,
    skippedSubjects,
    days: persisted.daysPersisted,
    slotsAssigned: persisted.slotsAssigned,
    optimization: {
      attempts: best.attemptsTried,
      bestScore: best.score,
      placedLectures: best.placedLectures,
      requiredLectures: best.requiredLectures,
      unplacedLectures: best.unplacedLectures,
      batchSplitSessions: best.batchSplitSessions,
      practicalSessions: best.practicalSessions,
      preferredMatches: best.preferredMatches,
    },
  };
}

async function generateSchedule({ branchId, sem, division, academicYear, createdBy }) {
  const r = await generateSchedulesForClasses({
    classConfigs: [{ branchId, sem, division }],
    academicYear, createdBy, optimizerRuns: 25,
  });
  return { days: r.days, slotsAssigned: r.slotsAssigned, optimization: r.optimization };
}

async function discoverClassConfigs({ branchIds, semesters, divisions, termType }) {
  const pb = Array.isArray(branchIds) ? branchIds.map(v => parseInt(v, 10)).filter(v => !Number.isNaN(v)) : [];
  const ps = Array.isArray(semesters) ? semesters.map(v => parseInt(v, 10)).filter(v => !Number.isNaN(v)) : [];
  const ts = resolveSemestersFromTermType(termType) || [];
  const psFinal = ps.length ? ps : ts;
  const where = {};
  if (pb.length) where.branch_id = { in: pb };
  if (psFinal.length) where.semester = { in: psFinal };
  const pairs = await prisma.subject.findMany({ where, select: { branch_id: true, semester: true }, distinct: ['branch_id', 'semester'] });
  const divs = (Array.isArray(divisions) && divisions.length ? divisions : DEFAULT_DIVISIONS).map(d => normalizeDivision(d)).filter(Boolean);
  const configs = [];
  for (const p of pairs) {
    if (p.branch_id == null || p.semester == null) continue;
    for (const d of divs) {
      const n = normalizeClassConfig({ branchId: p.branch_id, sem: p.semester, division: d });
      if (n) configs.push(n);
    }
  }
  const dd = new Map();
  for (const c of configs) dd.set(classKey(c), c);
  return [...dd.values()];
}

async function generateAllSchedules({ academicYear, createdBy, divisions, branchIds, semesters, termType }) {
  const configs = await discoverClassConfigs({ branchIds, semesters, divisions, termType });
  if (!configs.length) throw new Error('No class combinations found.');
  return generateSchedulesForClasses({ classConfigs: configs, academicYear, createdBy, optimizerRuns: 20 });
}

module.exports = { generateSchedule, generateAllSchedules };