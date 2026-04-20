'use strict';

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const BRANCH_ID = 1;
const ACAD_YEAR = '2025-26';
const EVEN_SEMESTERS = [2, 4, 6, 8];

const TIME_SLOT_TEMPLATES = [
  { label: 'Period 1', startTimeHr: 8, startTimeMinutes: 0, endTimeHr: 9, endTimeMinutes: 0, is_break: 0, sort_order: 1, is_active: 1 },
  { label: 'Period 2', startTimeHr: 9, startTimeMinutes: 0, endTimeHr: 10, endTimeMinutes: 0, is_break: 0, sort_order: 2, is_active: 1 },
  { label: 'Period 3', startTimeHr: 10, startTimeMinutes: 0, endTimeHr: 11, endTimeMinutes: 0, is_break: 0, sort_order: 3, is_active: 1 },
  { label: 'Period 4', startTimeHr: 11, startTimeMinutes: 0, endTimeHr: 12, endTimeMinutes: 0, is_break: 0, sort_order: 4, is_active: 1 },
  { label: 'Lunch Break', startTimeHr: 12, startTimeMinutes: 0, endTimeHr: 13, endTimeMinutes: 0, is_break: 1, sort_order: 5, is_active: 1 },
  { label: 'Period 5', startTimeHr: 13, startTimeMinutes: 0, endTimeHr: 14, endTimeMinutes: 0, is_break: 0, sort_order: 6, is_active: 1 },
  { label: 'Period 6', startTimeHr: 14, startTimeMinutes: 0, endTimeHr: 15, endTimeMinutes: 0, is_break: 0, sort_order: 7, is_active: 1 },
  { label: 'Period 7', startTimeHr: 15, startTimeMinutes: 0, endTimeHr: 16, endTimeMinutes: 0, is_break: 0, sort_order: 8, is_active: 1 },
  { label: 'Period 8', startTimeHr: 16, startTimeMinutes: 0, endTimeHr: 17, endTimeMinutes: 0, is_break: 0, sort_order: 9, is_active: 1 },
];

function buildRooms() {
  const classrooms = Array.from({ length: 12 }, (_, i) => ({
    room_number: `CR-${101 + i}`,
    name: `Classroom ${i + 1}`,
    capacity: 70,
    room_type: 'Classroom',
    branch_id: BRANCH_ID,
    floor: i < 6 ? '1' : '2',
    is_active: 1,
  }));

  const labs = Array.from({ length: 4 }, (_, i) => ({
    room_number: `LAB-${201 + i}`,
    name: `Computer Lab ${i + 1}`,
    capacity: 40,
    room_type: 'Lab',
    branch_id: BRANCH_ID,
    floor: '2',
    is_active: 1,
  }));

  return [...classrooms, ...labs];
}

function getSubjectTemplatesBySemester(semester) {
  const templates = {
    2: [
      { code: 'CS2-MATH', name: 'Engineering Mathematics II', isLab: false },
      { code: 'CS2-DS', name: 'Data Structures', isLab: false },
      { code: 'CS2-DL', name: 'Digital Logic', isLab: false },
      { code: 'CS2-OOP', name: 'Object Oriented Programming', isLab: false },
      { code: 'CS2-DM', name: 'Discrete Mathematics', isLab: false },
      { code: 'CS2-LAB-DS', name: 'Data Structures Lab', isLab: true },
      { code: 'CS2-LAB-OOP', name: 'OOP Lab', isLab: true },
      { code: 'CS2-LAB-DL', name: 'Digital Logic Lab', isLab: true },
    ],
    4: [
      { code: 'CS4-DBMS', name: 'Database Management Systems', isLab: false },
      { code: 'CS4-OS', name: 'Operating Systems', isLab: false },
      { code: 'CS4-CN', name: 'Computer Networks', isLab: false },
      { code: 'CS4-ALGO', name: 'Analysis of Algorithms', isLab: false },
      { code: 'CS4-SE', name: 'Software Engineering', isLab: false },
      { code: 'CS4-LAB-DBMS', name: 'DBMS Laboratory', isLab: true },
      { code: 'CS4-LAB-OS', name: 'OS Laboratory', isLab: true },
      { code: 'CS4-LAB-CN', name: 'CN Laboratory', isLab: true },
    ],
    6: [
      { code: 'CS6-CD', name: 'Compiler Design', isLab: false },
      { code: 'CS6-DSYS', name: 'Distributed Systems', isLab: false },
      { code: 'CS6-WEB', name: 'Web Engineering', isLab: false },
      { code: 'CS6-AI', name: 'Artificial Intelligence', isLab: false },
      { code: 'CS6-IS', name: 'Information Security', isLab: false },
      { code: 'CS6-LAB-WEB', name: 'Web Engineering Laboratory', isLab: true },
      { code: 'CS6-LAB-AI', name: 'AI Laboratory', isLab: true },
      { code: 'CS6-LAB-DSYS', name: 'Distributed Systems Laboratory', isLab: true },
    ],
    8: [
      { code: 'CS8-CLOUD', name: 'Cloud Computing', isLab: false },
      { code: 'CS8-DM', name: 'Data Mining', isLab: false },
      { code: 'CS8-IOT', name: 'Internet of Things', isLab: false },
      { code: 'CS8-ML', name: 'Machine Learning', isLab: false },
      { code: 'CS8-PM', name: 'Project Management', isLab: false },
      { code: 'CS8-LAB-CLOUD', name: 'Cloud Laboratory', isLab: true },
      { code: 'CS8-LAB-ML', name: 'Machine Learning Laboratory', isLab: true },
      { code: 'CS8-LAB-IOT', name: 'IOT Laboratory', isLab: true },
    ],
  };

  return templates[semester] || [];
}

async function ensureAdmin() {
  const admins = await prisma.user.findMany({
    where: { user_type: 1 },
    select: { uid: true, email: true },
  });

  if (admins.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    const created = await prisma.user.create({
      data: {
        email: 'admin@ttapp.com',
        user_type: 1,
        password: hash,
      },
      select: { uid: true, email: true },
    });
    return [created];
  }

  const knownAdmin = admins.find((a) => a.email === 'admin@ttapp.com');
  if (!knownAdmin) {
    const hash = await bcrypt.hash('admin123', 10);
    const created = await prisma.user.create({
      data: {
        email: 'admin@ttapp.com',
        user_type: 1,
        password: hash,
      },
      select: { uid: true, email: true },
    });
    return [...admins, created];
  }

  return admins;
}

async function clearAllNonAdminData() {
  await prisma.timeTableBatchSubject.deleteMany({});
  await prisma.timeTimeDetailed.deleteMany({});
  await prisma.tblTimeTable.deleteMany({});

  await prisma.facultyConstraint.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.timeSlotTemplate.deleteMany({});
  await prisma.holiday.deleteMany({});
  await prisma.fcmToken.deleteMany({});
  await prisma.copoUserCourseUsers.deleteMany({});
  await prisma.copoUserCourse.deleteMany({});

  await prisma.faculty.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      user_type: {
        not: 1,
      },
    },
  });
}

async function seedTeachersAndFaculty(count) {
  const teacherPasswordHash = await bcrypt.hash('teach123', 10);
  const facultyRows = [];

  for (let i = 1; i <= count; i += 1) {
    const index = String(i).padStart(2, '0');
    const email = `teacher${index}@ttapp.com`;

    const user = await prisma.user.create({
      data: {
        email,
        user_type: 2,
        password: teacherPasswordHash,
      },
      select: { uid: true },
    });

    const faculty = await prisma.faculty.create({
      data: {
        uid: user.uid,
        faculty_clg_id: `FAC-${index}`,
        name: `Teacher ${index}`,
        email,
        role: 'Professor',
        depart_id: 1,
        branch_id: BRANCH_ID,
        status: 1,
      },
      select: {
        faculty_id: true,
        name: true,
      },
    });

    await prisma.facultyConstraint.create({
      data: {
        faculty_id: faculty.faculty_id,
        max_lectures_per_day: 5,
        total_lectures_per_week: 24,
        unavailable_slots: [],
        preferred_slots: [
          { day: 'Monday', startHour: 9 },
          { day: 'Wednesday', startHour: 10 },
        ],
      },
    });

    facultyRows.push(faculty);
  }

  return facultyRows;
}

async function seedSubjects(facultyRows) {
  let pointer = 0;

  for (const sem of EVEN_SEMESTERS) {
    const templates = getSubjectTemplatesBySemester(sem);

    for (const subject of templates) {
      const faculty = facultyRows[pointer % facultyRows.length];
      pointer += 1;
      const weeklyHours = subject.isLab ? 2 : 4;

      await prisma.subject.create({
        data: {
          subject_code: subject.code,
          subject_name: subject.name,
          semester: sem,
          branch_id: BRANCH_ID,
          acad_year: ACAD_YEAR,
          weekly_hours: weeklyHours,
          semester_hours: weeklyHours * 16,
          professor_assign: String(faculty.faculty_id),
          totalcredits: weeklyHours,
          ispractical: subject.isLab ? 'Yes' : 'No',
          isoral: 'No',
          max_marks: 100,
          passing_marks: 40,
        },
      });
    }
  }
}

async function seedHolidays() {
  await prisma.holiday.createMany({
    data: [
      {
        date: new Date('2026-08-15'),
        name: 'Independence Day',
        type: 'National',
        description: 'National holiday',
        academic_year: ACAD_YEAR,
      },
      {
        date: new Date('2026-10-02'),
        name: 'Gandhi Jayanti',
        type: 'National',
        description: 'National holiday',
        academic_year: ACAD_YEAR,
      },
    ],
  });
}

async function printSummary() {
  const [userCount, facultyCount, roomCount, subjectCount, slotTemplateCount, adminCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.faculty.count(),
      prisma.room.count(),
      prisma.subject.count(),
      prisma.timeSlotTemplate.count(),
      prisma.user.count({ where: { user_type: 1 } }),
    ]);

  console.log('\nSeed Summary:');
  console.log(`  Admin users kept: ${adminCount}`);
  console.log(`  Total users: ${userCount}`);
  console.log(`  Faculty: ${facultyCount}`);
  console.log(`  Rooms: ${roomCount}`);
  console.log(`  Subjects (even sem only): ${subjectCount}`);
  console.log(`  Time slot templates: ${slotTemplateCount}`);
}

async function main() {
  console.log('Reset + even-semester seed started...');

  const admins = await ensureAdmin();
  console.log(`Admins preserved: ${admins.length}`);

  await clearAllNonAdminData();
  console.log('Cleared all non-admin and timetable/domain data.');

  await prisma.timeSlotTemplate.createMany({ data: TIME_SLOT_TEMPLATES });
  await prisma.room.createMany({ data: buildRooms() });
  console.log('Seeded time slots and rooms.');

  const facultyRows = await seedTeachersAndFaculty(24);
  console.log(`Seeded faculty: ${facultyRows.length}`);

  await seedSubjects(facultyRows);
  await seedHolidays();

  await printSummary();
  console.log('\nReset + seed completed successfully.');
  console.log('Admin login kept. Test admin credentials (if needed): admin@ttapp.com / admin123');
}

main()
  .catch((err) => {
    console.error('Reset + seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
