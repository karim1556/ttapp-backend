'use strict';

const prisma = require('../src/config/prisma');
const bcrypt = require('bcryptjs');

const BRANCH_ID = 2; // IT
const SEMESTER = 6;
const ACAD_YEAR = '2025-26';

const FACULTY_DEFS = [
  { code: 'NM', name: 'Mr. Nilesh Mali',     email: 'nm.it@ttapp.com' },
  { code: 'MK', name: 'Dr. Medha Kulkarni',   email: 'mk.it@ttapp.com' },
  { code: 'AP', name: 'Ms. Ashwini Phalke',   email: 'ap.it@ttapp.com' },
  { code: 'AS', name: 'Ms. Archana Salaskar', email: 'as.it@ttapp.com' },
  { code: 'ML', name: 'Ms. Mayuri Lohar',     email: 'ml.it@ttapp.com' },
  { code: 'PM', name: 'Dr. Pradip Mane',      email: 'pm.it@ttapp.com' },
  { code: 'AT', name: 'Ms. Akshata Patil',    email: 'at.it@ttapp.com' },
  { code: 'SB', name: 'Mr. Sachin Barahate',  email: 'sb.it@ttapp.com' },
  { code: 'VA', name: 'Dr. Vedika Avhad',     email: 'va.it@ttapp.com' },
  { code: 'NS', name: 'Dr. Neeraj Sharma',    email: 'ns.it@ttapp.com' },
];

const ROOMS = [
  { room_number: '212', name: 'Room 212', room_type: 'Classroom', capacity: 60, is_active: 1 },
  { room_number: '213', name: 'Room 213', room_type: 'Classroom', capacity: 60, is_active: 1 },
  { room_number: '101', name: 'Lab 101',  room_type: 'Lab', capacity: 40, is_active: 1 },
  { room_number: '102', name: 'Lab 102',  room_type: 'Lab', capacity: 40, is_active: 1 },
  { room_number: '103', name: 'Lab 103',  room_type: 'Lab', capacity: 40, is_active: 1 },
  { room_number: '105', name: 'Lab 105',  room_type: 'Lab', capacity: 40, is_active: 1 },
  { room_number: '107', name: 'Lab 107',  room_type: 'Lab', capacity: 40, is_active: 1 },
  { room_number: '112', name: 'Lab 112',  room_type: 'Lab', capacity: 40, is_active: 1 },
];

async function main() {
  console.log('--- Step 1: Rooms ---');
  for (const r of ROOMS) {
    const existing = await prisma.room.findFirst({ where: { room_number: r.room_number } });
    if (!existing) {
      await prisma.room.create({ data: r });
      console.log(`Created Room: ${r.room_number} (${r.room_type})`);
    } else {
      console.log(`Room already exists: ${r.room_number}`);
    }
  }

  console.log('\n--- Step 2: Faculty ---');
  const facultyMap = {};
  const hash = await bcrypt.hash('teach123', 10);

  for (const f of FACULTY_DEFS) {
    let faculty = await prisma.faculty.findFirst({ where: { email: f.email } });
    if (!faculty) {
      const user = await prisma.user.create({
        data: { email: f.email, user_type: 2, password: hash },
        select: { uid: true },
      });
      faculty = await prisma.faculty.create({
        data: {
          uid: user.uid,
          name: f.name,
          email: f.email,
          role: 'Professor',
          branch_id: BRANCH_ID,
          status: 1,
          depart_id: 2,
        },
        select: { faculty_id: true },
      });
      await prisma.facultyConstraint.create({
        data: {
          faculty_id: faculty.faculty_id,
          max_lectures_per_day: 5,
          total_lectures_per_week: 24,
          unavailable_slots: [],
          preferred_slots: [],
        },
      });
      console.log(`Created Faculty: ${f.name} (id=${faculty.faculty_id})`);
    } else {
      console.log(`Faculty already exists: ${f.name} (id=${faculty.faculty_id})`);
    }
    facultyMap[f.code] = faculty.faculty_id;
  }

  console.log('\n--- Step 3: Clear Old Subjects & Timetables ---');
  await prisma.subject.deleteMany({ where: { branch_id: BRANCH_ID, semester: SEMESTER } });
  console.log('Cleared existing subjects for IT Sem 6');

  // Also clear timetable detailed records & tables for IT Sem 6
  const ttRows = await prisma.tblTimeTable.findMany({
    where: { branch_id: BRANCH_ID, sem: String(SEMESTER) },
    select: { id: true },
  });
  const ttIds = ttRows.map(r => r.id);
  if (ttIds.length > 0) {
    const detailedRows = await prisma.timeTimeDetailed.findMany({
      where: { timetable_id: { in: ttIds } },
      select: { id: true },
    });
    const detailedIds = detailedRows.map(r => r.id);
    await prisma.timeTableBatchSubject.deleteMany({ where: { time_table_detailed_id: { in: detailedIds } } });
    await prisma.timeTimeDetailed.deleteMany({ where: { timetable_id: { in: ttIds } } });
    await prisma.tblTimeTable.deleteMany({ where: { id: { in: ttIds } } });
    console.log(`Cleared ${ttRows.length} existing timetable records for IT Sem 6`);
  }

  console.log('\n--- Step 4: Seed IT Sem 6 Subjects ---');
  // 4a. Theory Subjects (shared across divisions, division = null)
  const theorySubjects = [
    { code: 'DMBI',    name: 'Data Mining & Business Intelligence', professor: 'NM' },
    { code: 'Web X',   name: 'Web X & Web Lab (Theory)',            professor: 'MK' },
    { code: 'WT',      name: 'Wireless Technology',                 professor: 'AP' },
    { code: 'AIDS-I',  name: 'AI & DS - I',                         professor: 'AS' },
    { code: 'SA',      name: 'Software Architecture',               professor: 'ML' },
  ];

  for (const s of theorySubjects) {
    const fid = facultyMap[s.professor];
    await prisma.subject.create({
      data: {
        subject_code:    s.code,
        subject_name:    s.name,
        semester:        SEMESTER,
        branch_id:       BRANCH_ID,
        acad_year:       ACAD_YEAR,
        weekly_hours:    3,
        semester_hours:  48,
        professor_assign: fid ? String(fid) : null,
        totalcredits:    3,
        ispractical:     'No',
        isoral:          'No',
        max_marks:       100,
        passing_marks:   40,
      },
    });
    console.log(`Created Theory Subject: ${s.code} (Prof: ${s.professor})`);
  }

  // 4b. Division A Labs (division = 'A')
  const divALabs = [
    { code: 'WebX-A',   name: 'Web X Lab (Batch A)',             professor: 'MK', batch: 'A' },
    { code: 'WebX-B',   name: 'Web X Lab (Batch B)',             professor: 'MK', batch: 'B' },
    { code: 'WebX-C',   name: 'Web X Lab (Batch C)',             professor: 'MK', batch: 'C' },
    { code: 'BI-A',     name: 'Business Intelligence (Batch A)', professor: 'NM', batch: 'A' },
    { code: 'BI-B',     name: 'Business Intelligence (Batch B)', professor: 'NM', batch: 'B' },
    { code: 'BI-C',     name: 'Business Intelligence (Batch C)', professor: 'NM', batch: 'C' },
    { code: 'DSPS-A',   name: 'DS Using Python (Batch A)',       professor: 'AS', batch: 'A' },
    { code: 'DSPS-B',   name: 'DS Using Python (Batch B)',       professor: 'AS', batch: 'B' },
    { code: 'DSPS-C',   name: 'DS Using Python (Batch C)',       professor: 'AS', batch: 'C' },
    { code: 'SNL-A',    name: 'Sensor Lab (Batch A)',            professor: 'AP', batch: 'A' },
    { code: 'SNL-B',    name: 'Sensor Lab (Batch B)',            professor: 'PM', batch: 'B' },
    { code: 'SNL-C',    name: 'Sensor Lab (Batch C)',            professor: 'PM', batch: 'C' },
    { code: 'MAD/PWA-A',name: 'MAD/PWA Lab (Batch A)',           professor: 'ML', batch: 'A' },
    { code: 'MAD/PWA-B',name: 'MAD/PWA Lab (Batch B)',           professor: 'ML', batch: 'B' },
    { code: 'MAD/PWA-C',name: 'MAD/PWA Lab (Batch C)',           professor: 'ML', batch: 'C' },
    { code: 'Mini Project-A', name: 'Mini Project (Batch A)',    professor: 'NM', batch: 'A' },
    { code: 'Mini Project-B', name: 'Mini Project (Batch B)',    professor: 'SB', batch: 'B' },
    { code: 'Mini Project-C', name: 'Mini Project (Batch C)',    professor: 'VA', batch: 'C' },
  ];

  for (const s of divALabs) {
    const fid = facultyMap[s.professor];
    await prisma.subject.create({
      data: {
        subject_code:    s.code,
        subject_name:    s.name,
        semester:        SEMESTER,
        branch_id:       BRANCH_ID,
        acad_year:       ACAD_YEAR,
        weekly_hours:    2,
        semester_hours:  32,
        professor_assign: fid ? String(fid) : null,
        totalcredits:    1,
        ispractical:     'Yes',
        isoral:          'No',
        batch:           s.batch,
        division:        'A',
        max_marks:       100,
        passing_marks:   40,
      },
    });
  }
  console.log(`Created ${divALabs.length} Division A Lab Subjects`);

  // 4c. Division B Labs (division = 'B')
  const divBLabs = [
    { code: 'WebX-A',   name: 'Web X Lab (Batch A)',             professor: 'AT', batch: 'A' },
    { code: 'WebX-B',   name: 'Web X Lab (Batch B)',             professor: 'AT', batch: 'B' },
    { code: 'WebX-C',   name: 'Web X Lab (Batch C)',             professor: 'AT', batch: 'C' },
    { code: 'BI-A',     name: 'Business Intelligence (Batch A)', professor: 'NM', batch: 'A' },
    { code: 'BI-B',     name: 'Business Intelligence (Batch B)', professor: 'SB', batch: 'B' },
    { code: 'BI-C',     name: 'Business Intelligence (Batch C)', professor: 'SB', batch: 'C' },
    { code: 'DSPS-A',   name: 'DS Using Python (Batch A)',       professor: 'AT', batch: 'A' },
    { code: 'DSPS-B',   name: 'DS Using Python (Batch B)',       professor: 'AT', batch: 'B' },
    { code: 'DSPS-C',   name: 'DS Using Python (Batch C)',       professor: 'AS', batch: 'C' },
    { code: 'SNL-A',    name: 'Sensor Lab (Batch A)',            professor: 'AP', batch: 'A' },
    { code: 'SNL-B',    name: 'Sensor Lab (Batch B)',            professor: 'PM', batch: 'B' },
    { code: 'SNL-C',    name: 'Sensor Lab (Batch C)',            professor: 'AP', batch: 'C' },
    { code: 'MAD/PWA-A',name: 'MAD/PWA Lab (Batch A)',           professor: 'ML', batch: 'A' },
    { code: 'MAD/PWA-B',name: 'MAD/PWA Lab (Batch B)',           professor: 'ML', batch: 'B' },
    { code: 'MAD/PWA-C',name: 'MAD/PWA Lab (Batch C)',           professor: 'ML', batch: 'C' },
    { code: 'Mini Project-A', name: 'Mini Project (Batch A)',    professor: 'MK', batch: 'A' },
    { code: 'Mini Project-B', name: 'Mini Project (Batch B)',    professor: 'AS', batch: 'B' },
    { code: 'Mini Project-C', name: 'Mini Project (Batch C)',    professor: 'NS', batch: 'C' },
  ];

  for (const s of divBLabs) {
    const fid = facultyMap[s.professor];
    await prisma.subject.create({
      data: {
        subject_code:    s.code,
        subject_name:    s.name,
        semester:        SEMESTER,
        branch_id:       BRANCH_ID,
        acad_year:       ACAD_YEAR,
        weekly_hours:    2,
        semester_hours:  32,
        professor_assign: fid ? String(fid) : null,
        totalcredits:    1,
        ispractical:     'Yes',
        isoral:          'No',
        batch:           s.batch,
        division:        'B',
        max_marks:       100,
        passing_marks:   40,
      },
    });
  }
  console.log(`Created ${divBLabs.length} Division B Lab Subjects`);

  console.log('\n--- Step 5: Seed Custom Timeslot Templates ---');
  // Clear old timeslots for IT Sem 6
  await prisma.timeSlotTemplate.deleteMany({
    where: { branch_id: BRANCH_ID, semester: SEMESTER },
  });

  const slots = [
    { label: 'Period 1',    startTimeHr: 9,  startTimeMinutes: 0,  endTimeHr: 10, endTimeMinutes: 0,  is_break: 0, sort_order: 1 },
    { label: 'Period 2',    startTimeHr: 10, startTimeMinutes: 0,  endTimeHr: 11, endTimeMinutes: 0,  is_break: 0, sort_order: 2 },
    { label: 'Short Break', startTimeHr: 11, startTimeMinutes: 0,  endTimeHr: 11, endTimeMinutes: 20, is_break: 1, sort_order: 3 },
    { label: 'Period 3',    startTimeHr: 11, startTimeMinutes: 20, endTimeHr: 12, endTimeMinutes: 20, is_break: 0, sort_order: 4 },
    { label: 'Period 4',    startTimeHr: 12, startTimeMinutes: 20, endTimeHr: 13, endTimeMinutes: 20, is_break: 0, sort_order: 5 },
    { label: 'Lunch Break', startTimeHr: 13, startTimeMinutes: 20, endTimeHr: 14, endTimeMinutes: 0,  is_break: 1, sort_order: 6 },
    { label: 'Period 5',    startTimeHr: 14, startTimeMinutes: 0,  endTimeHr: 15, endTimeMinutes: 0,  is_break: 0, sort_order: 7 },
    { label: 'Period 6',    startTimeHr: 15, startTimeMinutes: 0,  endTimeHr: 16, endTimeMinutes: 0,  is_break: 0, sort_order: 8 },
  ];

  await prisma.timeSlotTemplate.createMany({
    data: slots.map(s => ({
      ...s,
      branch_id: BRANCH_ID,
      semester:  SEMESTER,
      division:  null, // shared fallback
      is_active: 1,
    })),
  });
  console.log(`Seeded ${slots.length} time slot templates for IT Sem 6`);

  console.log('\n--- Step 6: Seed Class Lab Slot Configurations ---');
  await prisma.classLabSlot.deleteMany({
    where: { branch_id: BRANCH_ID, semester: SEMESTER },
  });

  // Div A: Rotated labs (WebX, SNL, MAD/PWA, DSPS, BI) in morning slot (idx 0), Mini Project in afternoon (idx 6)
  await prisma.classLabSlot.create({
    data: {
      branch_id: BRANCH_ID,
      semester:  SEMESTER,
      division:  'A',
      batch_split_slot_index: 0, // Period 1 (09:00 - 11:00)
      lab_slot_index:         6, // Period 5 (14:00 - 16:00)
      batch_split_enabled:    1,
      lab_duration_slots:     2,
      home_room:              '212',
      academic_year:          ACAD_YEAR,
    },
  });

  // Div B: Rotated labs (WebX, SNL, MAD/PWA, DSPS, BI) in mid-day slot (idx 3), Mini Project in afternoon (idx 6)
  await prisma.classLabSlot.create({
    data: {
      branch_id: BRANCH_ID,
      semester:  SEMESTER,
      division:  'B',
      batch_split_slot_index: 3, // Period 3 (11:20 - 13:20)
      lab_slot_index:         6, // Period 5 (14:00 - 16:00)
      batch_split_enabled:    1,
      lab_duration_slots:     2,
      home_room:              '213',
      academic_year:          ACAD_YEAR,
    },
  });
  console.log('Seeded ClassLabSlot configurations for IT Sem 6 Div A & B');

  console.log('\nSeeding completed successfully!');
}

main()
  .catch(e => { console.error('Seeding failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
