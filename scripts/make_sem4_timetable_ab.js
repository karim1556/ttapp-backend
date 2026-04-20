'use strict';

const prisma = require('../src/config/prisma');
const { generateAllSchedules } = require('../src/services/timetable.service');

const BRANCH_ID = 1;
const SEMESTER = 4;
const DIVISIONS = ['A', 'B'];
const ACADEMIC_YEAR = '2025-26';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TIME_SLOTS_9_TO_5 = [
  { label: 'Period 1', startTimeHr: 9, startTimeMinutes: 0, endTimeHr: 10, endTimeMinutes: 0, is_break: 0, sort_order: 1, is_active: 1 },
  { label: 'Period 2', startTimeHr: 10, startTimeMinutes: 0, endTimeHr: 11, endTimeMinutes: 0, is_break: 0, sort_order: 2, is_active: 1 },
  { label: 'Period 3', startTimeHr: 11, startTimeMinutes: 0, endTimeHr: 12, endTimeMinutes: 0, is_break: 0, sort_order: 3, is_active: 1 },
  { label: 'Period 4', startTimeHr: 12, startTimeMinutes: 0, endTimeHr: 13, endTimeMinutes: 0, is_break: 0, sort_order: 4, is_active: 1 },
  { label: 'Lunch Break', startTimeHr: 13, startTimeMinutes: 0, endTimeHr: 14, endTimeMinutes: 0, is_break: 1, sort_order: 5, is_active: 1 },
  { label: 'Period 5', startTimeHr: 14, startTimeMinutes: 0, endTimeHr: 15, endTimeMinutes: 0, is_break: 0, sort_order: 6, is_active: 1 },
  { label: 'Period 6', startTimeHr: 15, startTimeMinutes: 0, endTimeHr: 16, endTimeMinutes: 0, is_break: 0, sort_order: 7, is_active: 1 },
  { label: 'Period 7', startTimeHr: 16, startTimeMinutes: 0, endTimeHr: 17, endTimeMinutes: 0, is_break: 0, sort_order: 8, is_active: 1 },
];

const SEM4_SUBJECTS = [
  { subject_code: '2114111', subject_name: 'Computational Theory', credits: 3, isLab: false },
  { subject_code: '2114112', subject_name: 'Database Management System', credits: 3, isLab: false },
  { subject_code: '2114113', subject_name: 'Operating System', credits: 3, isLab: false },
  { subject_code: '2114114', subject_name: 'Database Management System Lab', credits: 1, isLab: true },
  { subject_code: '2114115', subject_name: 'Operating System Lab', credits: 1, isLab: true },
  { subject_code: '2314211', subject_name: 'Microprocessors and Microcontrollers', credits: 3, isLab: false },
  { subject_code: '2314212', subject_name: 'Microprocessors and Microcontrollers Lab', credits: 1, isLab: true },
  { subject_code: '1052312', subject_name: 'Logic and Data Interpretation II (OE)', credits: 2, isLab: false },
  { subject_code: '2114411', subject_name: 'Mini Project', credits: 2, isLab: false },
  { subject_code: '2994511', subject_name: 'Business Model Development', credits: 2, isLab: false },
  { subject_code: '2994512', subject_name: 'Design Thinking', credits: 2, isLab: false },
];

function slotKey(day, hr, min) {
  return `${day}_${hr}_${min}`;
}

async function setupTimeSlots() {
  await prisma.timeSlotTemplate.deleteMany({});
  await prisma.timeSlotTemplate.createMany({ data: TIME_SLOTS_9_TO_5 });
}

async function setupSem4Subjects() {
  const faculty = await prisma.faculty.findMany({
    where: {
      status: 1,
      OR: [{ branch_id: BRANCH_ID }, { branch_id: null }],
    },
    select: {
      faculty_id: true,
      name: true,
    },
    orderBy: { faculty_id: 'asc' },
  });

  if (faculty.length < SEM4_SUBJECTS.length) {
    throw new Error(
      `Need at least ${SEM4_SUBJECTS.length} active faculty for sem 4 mapping, found ${faculty.length}`,
    );
  }

  await prisma.subject.deleteMany({
    where: {
      branch_id: BRANCH_ID,
      semester: SEMESTER,
    },
  });

  let seededSubjects = 0;

  for (let i = 0; i < SEM4_SUBJECTS.length; i++) {
    const subject = SEM4_SUBJECTS[i];
    const facultyMember = faculty[i % faculty.length];
    const weeklyHours = subject.isLab ? 2 : subject.credits;
    const semesterHours = weeklyHours * 16;

    await prisma.subject.create({
      data: {
        subject_code: subject.subject_code,
        subject_name: subject.subject_name,
        semester: SEMESTER,
        branch_id: BRANCH_ID,
        acad_year: ACADEMIC_YEAR,
        weekly_hours: weeklyHours,
        semester_hours: semesterHours,
        professor_assign: String(facultyMember.faculty_id),
        totalcredits: weeklyHours,
        ispractical: subject.isLab ? 'Yes' : 'No',
        isoral: 'No',
        max_marks: 100,
        passing_marks: 40,
      },
    });

    seededSubjects += 1;
  }

  return {
    mappedFacultyCount: Math.min(seededSubjects, faculty.length),
    seededSubjects,
  };
}

function analyzeClassDayGaps(ttDay, breakSlots) {
  const nonBreak = ttDay.time_details
    .filter((s) => !breakSlots.has(`${s.startTimeHr}_${s.startTimeMinutes}`))
    .sort((a, b) => {
      if (a.startTimeHr !== b.startTimeHr) return a.startTimeHr - b.startTimeHr;
      return a.startTimeMinutes - b.startTimeMinutes;
    });

  const occupied = nonBreak.map((s) => (s.batch_subjects || []).length > 0);
  const first = occupied.indexOf(true);
  if (first < 0) return 0;
  let last = occupied.length - 1;
  while (last >= 0 && !occupied[last]) last -= 1;

  let gaps = 0;
  for (let i = first; i <= last; i++) {
    if (!occupied[i]) gaps += 1;
  }

  return gaps;
}

async function verifyTimetable() {
  const slotTemplates = await prisma.timeSlotTemplate.findMany({
    where: { is_active: 1 },
    orderBy: { sort_order: 'asc' },
  });

  const breakSlots = new Set(
    slotTemplates
      .filter((s) => s.is_break)
      .map((s) => `${s.startTimeHr}_${s.startTimeMinutes}`),
  );

  const rows = await prisma.tblTimeTable.findMany({
    where: {
      branch_id: BRANCH_ID,
      sem: String(SEMESTER),
      division: { in: DIVISIONS },
    },
    include: {
      time_details: {
        include: {
          batch_subjects: true,
        },
        orderBy: [{ startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
      },
    },
  });

  const classDays = new Map();
  const classLectureCounts = new Map();
  const classDayLabSlotSets = new Map();
  const facultySlots = new Map();
  const roomSlots = new Map();
  const gapsByClassDay = new Map();

  for (const ttDay of rows) {
    const classKey = `${ttDay.division}`;
    if (!classDays.has(classKey)) classDays.set(classKey, new Set());
    classDays.get(classKey).add(ttDay.dateOfWeek);

    // Ensure 9–5 bounds
    for (const slot of ttDay.time_details) {
      const start = (slot.startTimeHr ?? 0) + (slot.startTimeMinutes ?? 0) / 60;
      const end = (slot.endTimeHr ?? 0) + (slot.endTimeMinutes ?? 0) / 60;
      if (start < 9 || end > 17) {
        throw new Error(
          `Slot out of 9-5 range for division ${ttDay.division} on ${ttDay.dateOfWeek}: ${slot.startTimeHr}:${slot.startTimeMinutes}`,
        );
      }
    }

    // Gap check per day
    const gaps = analyzeClassDayGaps(ttDay, breakSlots);
    gapsByClassDay.set(`${ttDay.division}_${ttDay.dateOfWeek}`, gaps);

    // Conflict and lecture accounting
    for (const slot of ttDay.time_details) {
      const hasLabInSlot = (slot.batch_subjects || []).some((lecture) => lecture.typeOfLecture === 'Lab');
      if (hasLabInSlot) {
        const slotLabs = (slot.batch_subjects || []).filter((lecture) => lecture.typeOfLecture === 'Lab');
        const slotBatchSet = new Set(slotLabs.map((l) => String(l.batch || '').toUpperCase()));
        const slotSubjectSet = new Set(slotLabs.map((l) => String(l.subjectCode || '').trim()));
        const slotRoomSet = new Set(slotLabs.map((l) => String(l.room_number || '').trim()));

        if (!['A', 'B', 'C'].every((b) => slotBatchSet.has(b))) {
          throw new Error(
            `Parallel lab batch coverage failed for division ${ttDay.division} on ${ttDay.dateOfWeek} ${slot.startTimeHr}:${slot.startTimeMinutes}`,
          );
        }

        if (slotSubjectSet.size < 3) {
          throw new Error(
            `Parallel lab subject diversity failed for division ${ttDay.division} on ${ttDay.dateOfWeek} ${slot.startTimeHr}:${slot.startTimeMinutes}`,
          );
        }

        if (slotRoomSet.size < 3) {
          throw new Error(
            `Parallel lab room diversity failed for division ${ttDay.division} on ${ttDay.dateOfWeek} ${slot.startTimeHr}:${slot.startTimeMinutes}`,
          );
        }

        const classDayKey = `${classKey}_${ttDay.dateOfWeek}`;
        if (!classDayLabSlotSets.has(classDayKey)) classDayLabSlotSets.set(classDayKey, new Set());
        classDayLabSlotSets.get(classDayKey).add(`${slot.startTimeHr}_${slot.startTimeMinutes}`);
      }

      for (const lecture of slot.batch_subjects || []) {
        classLectureCounts.set(classKey, (classLectureCounts.get(classKey) || 0) + 1);

        if (lecture.facultyid) {
          const fKey = `${slotKey(ttDay.dateOfWeek, slot.startTimeHr, slot.startTimeMinutes)}_${lecture.facultyid}`;
          const previous = facultySlots.get(fKey);
          if (previous && previous !== classKey) {
            throw new Error(
              `Faculty conflict at ${fKey}: ${previous} vs ${classKey}`,
            );
          }
          facultySlots.set(fKey, classKey);
        }

        if (lecture.room_number) {
          const rKey = `${slotKey(ttDay.dateOfWeek, slot.startTimeHr, slot.startTimeMinutes)}_${lecture.room_number}`;
          const previous = roomSlots.get(rKey);
          if (previous && previous !== classKey) {
            throw new Error(`Room conflict at ${rKey}: ${previous} vs ${classKey}`);
          }
          roomSlots.set(rKey, classKey);
        }
      }
    }

    // Lab continuity check: every lab slot must belong to a 2-hour contiguous pair.
    for (let i = 0; i < ttDay.time_details.length; i++) {
      const current = ttDay.time_details[i];
      const prev = ttDay.time_details[i - 1];
      const next = ttDay.time_details[i + 1];
      const currentLabs = (current.batch_subjects || []).filter((l) => l.typeOfLecture === 'Lab');
      if (!currentLabs.length) continue;

      for (const labLecture of currentLabs) {
        const matchPrev = (prev?.batch_subjects || []).find(
          (l) =>
            l.typeOfLecture === 'Lab' &&
            l.subjectCode === labLecture.subjectCode &&
            String(l.facultyid || '') === String(labLecture.facultyid || '') &&
            String(l.room_number || '') === String(labLecture.room_number || ''),
        );

        const matchNext = (next?.batch_subjects || []).find(
          (l) =>
            l.typeOfLecture === 'Lab' &&
            l.subjectCode === labLecture.subjectCode &&
            String(l.facultyid || '') === String(labLecture.facultyid || '') &&
            String(l.room_number || '') === String(labLecture.room_number || ''),
        );

        if (!matchPrev && !matchNext) {
          throw new Error(
            `Lab continuity failed for ${labLecture.subjectCode} on ${ttDay.dateOfWeek} division ${ttDay.division}: missing contiguous pair`,
          );
        }
      }
    }
  }

  for (const division of DIVISIONS) {
    const days = classDays.get(division);
    if (!days) {
      throw new Error(`No timetable generated for division ${division}`);
    }

    for (const day of DAYS) {
      if (!days.has(day)) {
        throw new Error(`Division ${division} missing day ${day}`);
      }
    }

    const lectureCount = classLectureCounts.get(division) || 0;
    if (lectureCount <= 0) {
      throw new Error(`Division ${division} has no lecture assignments`);
    }

    for (const day of DAYS) {
      const classDayKey = `${division}_${day}`;
      const labSlots = (classDayLabSlotSets.get(classDayKey) || new Set()).size;

      if (labSlots > 2) {
        throw new Error(
          `Division ${division} has more than one lab block on ${day} (${labSlots} lab slots)`,
        );
      }

      if (labSlots !== 0 && labSlots !== 2) {
        throw new Error(
          `Division ${division} has invalid lab duration on ${day} (${labSlots} lab slots)`,
        );
      }
    }
  }

  const worstGap = Math.max(...[...gapsByClassDay.values(), 0]);
  const maxLabSlotsInDay = Math.max(...[...[...classDayLabSlotSets.values()].map((s) => s.size), 0]);

  return {
    rows: rows.length,
    classLectureCounts: Object.fromEntries(classLectureCounts),
    classDayLabSlotCounts: Object.fromEntries(
      [...classDayLabSlotSets.entries()].map(([k, v]) => [k, v.size]),
    ),
    maxLabSlotsInDay,
    worstInternalGapSlots: worstGap,
    gapsByClassDay: Object.fromEntries(gapsByClassDay),
  };
}

async function main() {
  console.log('Preparing Sem 4 timetable for Division A and B...');

  const admin = await prisma.user.findFirst({
    where: { user_type: 1 },
    orderBy: { uid: 'asc' },
    select: { uid: true, email: true },
  });

  if (!admin) {
    throw new Error('No admin user found. Please create admin first.');
  }

  await setupTimeSlots();
  const seeded = await setupSem4Subjects();

  console.log('Sem 4 subjects seeded from provided list.');
  console.log(`Subjects seeded: ${seeded.seededSubjects}`);
  console.log(`Faculty mapped: ${seeded.mappedFacultyCount}`);

  const result = await generateAllSchedules({
    academicYear: ACADEMIC_YEAR,
    createdBy: admin.uid,
    branchIds: [BRANCH_ID],
    semesters: [SEMESTER],
    divisions: DIVISIONS,
  });

  const verification = await verifyTimetable();

  console.log('\nGeneration Result:');
  console.log(`  classCount: ${result.classCount}`);
  console.log(`  slotsAssigned: ${result.slotsAssigned}`);
  console.log(`  unplacedLectures: ${result.optimization.unplacedLectures}`);
  console.log(`  compactMoves: ${result.optimization.compactMoves}`);

  console.log('\nVerification Result:');
  console.log(`  timetableRows(days): ${verification.rows}`);
  console.log(`  lectureCounts: ${JSON.stringify(verification.classLectureCounts)}`);
  console.log(`  maxLabSlotsInDay: ${verification.maxLabSlotsInDay}`);
  console.log(`  worstInternalGapSlots: ${verification.worstInternalGapSlots}`);

  console.log('\nSem 4 Division A/B timetable is ready.');
}

main()
  .catch((err) => {
    console.error('Sem 4 timetable preparation failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
