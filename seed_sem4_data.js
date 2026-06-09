'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== DELETING ALL EXISTING DATA ===');
  await prisma.timeTableBatchSubject.deleteMany({});
  await prisma.timeTimeDetailed.deleteMany({});
  await prisma.tblTimeTable.deleteMany({});
  await prisma.substitutionRecord.deleteMany({});
  await prisma.facultyConstraint.deleteMany({});
  await prisma.faculty.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.classLabSlot.deleteMany({});
  console.log('  All timetable/faculty/subject/room data deleted (time slots kept)');

  console.log('\n=== CREATING VPPCOE&VA DATA ===');

  // ─── ROOMS (matching real VPPCOE rooms) ──────────────────
  const roomsData = [
    { room_number: '311', name: 'SE Div A Classroom',   room_type: 'Classroom', is_active: 1 },
    { room_number: '312', name: 'SE Div B / TE Div A',  room_type: 'Classroom', is_active: 1 },
    { room_number: '308', name: 'TE Alt Classroom',     room_type: 'Classroom', is_active: 1 },
    { room_number: '307', name: 'Batch Split Room 1',   room_type: 'Classroom', is_active: 1 },
    { room_number: '303', name: 'Batch Split Room 2',   room_type: 'Classroom', is_active: 1 },
    { room_number: '301', name: 'Batch Split Room 3',   room_type: 'Classroom', is_active: 1 },
    { room_number: '302', name: 'Batch Split Room 4',   room_type: 'Classroom', is_active: 1 },
    { room_number: '305', name: 'Lab Room 1',           room_type: 'Classroom', is_active: 1 },
    { room_number: '306', name: 'Lab Room 2',           room_type: 'Classroom', is_active: 1 },
  ];

  for (const r of roomsData) {
    await prisma.room.create({ data: r });
    console.log(`  Room: ${r.room_number} (${r.name})`);
  }

  // ─── FACULTY (matching real VPPCOE faculty codes) ────────
  // SE SEM IV Faculty
  const facultyData = [
    { id: 39,  name: 'Dr. Rais A. Mulla',          code: 'DrRM', hrs: 22 },
    { id: 40,  name: 'Prof. Manisha Patil',         code: 'MPA',  hrs: 22 },
    { id: 41,  name: 'Prof. Priyanka Rane',         code: 'PR',   hrs: 22 },
    { id: 42,  name: 'Prof. Priya M. Gupta',        code: 'PG',   hrs: 22 },
    { id: 43,  name: 'Prof. P. M. Manegopale',      code: 'PMM',  hrs: 22 },
    { id: 36,  name: 'Prof. Asharani Shinde',       code: 'AS',   hrs: 22 },
    { id: 48,  name: 'Prof. Tina Sawant',           code: 'TS',   hrs: 22 },
    { id: 44,  name: 'Prof. Bharat K. Parmar',      code: 'BP',   hrs: 22 },
    { id: 55,  name: 'Prof. N. F.',                 code: 'NF',   hrs: 22 },
    { id: 45,  name: 'Prof. Seeta Tapare',          code: 'ST',   hrs: 22 },
    { id: 46,  name: 'Prof. Vinod Alone',           code: 'VA',   hrs: 22 },
    { id: 47,  name: 'Dr. Mahendra Pawar',          code: 'DrMP', hrs: 22 },
    { id: 56,  name: 'Open Elective Faculty',       code: 'FK',   hrs: 22 },
    // TE SEM VI Faculty (some shared with SE)
    { id: 50,  name: 'Dr. Balasaheb Balkhande',     code: 'DrBB', hrs: 22 },
    { id: 51,  name: 'Prof. Prajakta Khelkar',      code: 'PK',   hrs: 22 },
    { id: 54,  name: 'Prof. Atul Shintre',          code: 'AS_TE', hrs: 22 },
    { id: 52,  name: 'Prof. Tulsidas Mane',         code: 'TM',   hrs: 22 },
    { id: 53,  name: 'Prof. Karishma Shambharkar',  code: 'KS',   hrs: 22 },
    { id: 57,  name: 'Prof. Manish Patil',          code: 'MPA_TE', hrs: 22 },
    { id: 58,  name: 'Dr. Gayatri Bachhav',         code: 'DrGB', hrs: 22 },
  ];

  for (const f of facultyData) {
    await prisma.faculty.create({
      data: {
        faculty_id: f.id, name: f.name,
        weekly_work_hours: f.hrs, branch_id: 1, status: 1,
      },
    });
    await prisma.facultyConstraint.create({
      data: { faculty_id: f.id, max_lectures_per_day: 5, total_lectures_per_week: f.hrs },
    });
    console.log(`  Faculty: ${f.code} → ${f.name} (ID: ${f.id})`);
  }

  // ─── SE SEM IV SUBJECTS ─────────────────────────────────
  const base4 = {
    semester: 4, branch_id: 1, acad_year: '2025-26',
    max_marks: 100, isoral: 'No', oral_marks: 0,
    practical_marks: 0, passing_marks: 40,
  };

  // Theory subjects — weekly_hours based on actual timetable analysis:
  // DBMS: ~3 whole-div lectures/week (+ batch-split appearances)
  // OS: ~3 whole-div lectures/week
  // CT: ~3 whole-div lectures/week
  // MPMC: ~3 whole-div lectures/week
  // BMD: ~2 whole-div lectures/week
  // DT: ~2 whole-div lectures/week
  // OE: ~2 whole-div lectures/week
  const theoryList4 = [
    { code: 'DBMS', name: 'Database Management System',        hrs: 3, cred: 3, prof: '40' }, // MPA
    { code: 'CT',   name: 'Computational Theory',              hrs: 3, cred: 3, prof: '41' }, // PR
    { code: 'MPMC', name: 'Microprocessor & Microcontroller',  hrs: 3, cred: 3, prof: '42' }, // PG
    { code: 'OS',   name: 'Operating System',                  hrs: 3, cred: 3, prof: '43' }, // PMM
    { code: 'BMD',  name: 'Business Model Development',        hrs: 2, cred: 2, prof: '36' }, // AS
    { code: 'DT',   name: 'Design Thinking',                   hrs: 2, cred: 2, prof: '48' }, // TS
    { code: 'OE',   name: 'Open Elective',                     hrs: 2, cred: 2, prof: '56' }, // FK
  ];

  for (const s of theoryList4) {
    await prisma.subject.create({
      data: {
        ...base4, ispractical: 'No',
        subject_code: s.code, subject_name: s.name,
        weekly_hours: s.hrs, semester_hours: s.hrs * 16,
        totalcredits: s.cred, professor_assign: s.prof, batch: null,
      },
    });
    console.log(`  SE4 Theory: ${s.code} (${s.name}) → faculty ID ${s.prof}`);
  }

  // Practical subjects (batch-split): DBMS, OS, MPMC, BMD, DT, and MinP
  const labList4 = [
    {
      baseCode: 'DBMS', baseName: 'Database Management System Lab',
      hrs: 2, cred: 1,
      profs: { A: '40', B: '40', C: '40' }, // MPA
    },
    {
      baseCode: 'OS', baseName: 'Operating System Lab',
      hrs: 2, cred: 1,
      profs: { A: '43', B: '43', C: '43' }, // PMM
    },
    {
      baseCode: 'MPMC', baseName: 'Microprocessor & Microcontroller Lab',
      hrs: 2, cred: 1,
      profs: { A: '42', B: '42', C: '42' }, // PG
    },
    {
      baseCode: 'BMD', baseName: 'Business Model Development Lab',
      hrs: 2, cred: 1,
      profs: { A: '36', B: '36', C: '36' }, // AS
    },
    {
      baseCode: 'DT', baseName: 'Design Thinking Lab',
      hrs: 2, cred: 1,
      profs: { A: '48', B: '48', C: '48' }, // TS
    },
    {
      baseCode: 'MinP', baseName: 'Mini Project IB',
      hrs: 4, cred: 2, // 4 hours/week = scheduled on 2 different days
      profs: { A: '39', B: '58', C: '36' },
    },
  ];

  for (const lab of labList4) {
    for (const batch of ['A', 'B', 'C']) {
      await prisma.subject.create({
        data: {
          ...base4, ispractical: 'Yes',
          subject_code: `${lab.baseCode}-${batch}`,
          subject_name: `${lab.baseName} (Batch ${batch})`,
          weekly_hours: lab.hrs, semester_hours: lab.hrs * 16,
          totalcredits: lab.cred,
          professor_assign: lab.profs[batch],
          batch: batch,
        },
      });
    }
    console.log(`  SE4 Practical: ${lab.baseCode} (A/B/C)`);
  }

  // ─── TE SEM VI SUBJECTS ─────────────────────────────────
  const base6 = {
    semester: 6, branch_id: 1, acad_year: '2025-26',
    max_marks: 100, isoral: 'No', oral_marks: 0,
    practical_marks: 0, passing_marks: 40,
  };

  const theoryList6 = [
    { code: 'AI',   name: 'Artificial Intelligence',                    hrs: 3, cred: 3, prof: '50' }, // DrBB
    { code: 'SPCC', name: 'System Programming & Compiler Construction', hrs: 3, cred: 3, prof: '51' }, // PK
    { code: 'CSS',  name: 'Cryptography & System Security',            hrs: 3, cred: 3, prof: '54' }, // AS (TE)
    { code: 'MCOM', name: 'Mobile Computing',                          hrs: 3, cred: 3, prof: '52' }, // TM
    { code: 'QA',   name: 'DLO-II Qualitative Analysis',               hrs: 2, cred: 2, prof: '53' }, // KS
  ];

  for (const s of theoryList6) {
    await prisma.subject.create({
      data: {
        ...base6, ispractical: 'No',
        subject_code: s.code, subject_name: s.name,
        weekly_hours: s.hrs, semester_hours: s.hrs * 16,
        totalcredits: s.cred, professor_assign: s.prof, batch: null,
      },
    });
    console.log(`  TE6 Theory: ${s.code} (${s.name}) → faculty ID ${s.prof}`);
  }

  // TE Practicals: standard rotated labs (SBLC, MCOM, SPCC, CSS, AI) and project lab (MinP2B)
  const labList6 = [
    {
      baseCode: 'SBLC', baseName: 'Skill Based Lab Course',
      hrs: 2, cred: 1,
      profs: { A: '44', B: '41', C: '41' }, // BP / PR / PR
    },
    {
      baseCode: 'MCOM', baseName: 'Mobile Computing Lab',
      hrs: 2, cred: 1,
      profs: { A: '52', B: '52', C: '52' }, // TM
    },
    {
      baseCode: 'SPCC', baseName: 'System Programming & Compiler Construction Lab',
      hrs: 2, cred: 1,
      profs: { A: '51', B: '51', C: '51' }, // PK
    },
    {
      baseCode: 'CSS', baseName: 'Cryptography & System Security Lab',
      hrs: 2, cred: 1,
      profs: { A: '54', B: '54', C: '54' }, // AS_TE
    },
    {
      baseCode: 'AI', baseName: 'Artificial Intelligence Lab',
      hrs: 2, cred: 1,
      profs: { A: '50', B: '50', C: '50' }, // DrBB
    },
    {
      baseCode: 'MinP2B', baseName: 'Mini Project 2B',
      hrs: 4, cred: 2, // 4 hours/week = scheduled on 2 different days
      profs: { A: '41', B: '57', C: '53' }, // PR / MPA_TE / KS
    },
  ];

  for (const lab of labList6) {
    for (const batch of ['A', 'B', 'C']) {
      await prisma.subject.create({
        data: {
          ...base6, ispractical: 'Yes',
          subject_code: `${lab.baseCode}-${batch}`,
          subject_name: `${lab.baseName} (Batch ${batch})`,
          weekly_hours: lab.hrs, semester_hours: lab.hrs * 16,
          totalcredits: lab.cred,
          professor_assign: lab.profs[batch],
          batch: batch,
        },
      });
    }
    console.log(`  TE6 Practical: ${lab.baseCode} (A/B/C)`);
  }

  // ─── PER-DIVISION SLOT CONFIGURATION ────────────────────
  // Time slots (0-indexed, 9 total including breaks):
  //   0: 9:00-10:00   1: 10:00-11:00   2: 11:00-11:20 (BREAK)
  //   3: 11:20-12:20   4: 12:20-1:20    5: 1:20-2:00 (LUNCH)
  //   6: 2:00-3:00     7: 3:00-4:00     8: 4:00-5:00

  const classConfigs = [
    // ── SE SEM IV ──
    {
      branch_id: 1, semester: 4, division: 'A', academic_year: '2025-26',
      batch_split_slot_index: 0,  // 9:00-10:00 → theory batch-split
      lab_slot_index: 6,          // 2:00-3:00 → practical batch-split (MinP)
      batch_split_enabled: 1,
      home_room: '311',
    },
    {
      branch_id: 1, semester: 4, division: 'B', academic_year: '2025-26',
      batch_split_slot_index: 3,  // 11:20-12:20 → theory batch-split
      lab_slot_index: 6,          // 2:00-3:00 → practical batch-split (MinP)
      batch_split_enabled: 1,
      home_room: '312',
    },
    // ── TE SEM VI ──
    {
      branch_id: 1, semester: 6, division: 'A', academic_year: '2025-26',
      batch_split_slot_index: 3,  // 11:20-12:20 → theory batch-split
      lab_slot_index: 6,          // 2:00-3:00 → practical batch-split (MinP/SBLC)
      batch_split_enabled: 1,
      home_room: '312',
    },
  ];

  for (const c of classConfigs) {
    await prisma.classLabSlot.create({ data: c });
    console.log(`  Config: Sem ${c.semester} Div ${c.division} → batchSplit=slot${c.batch_split_slot_index}, practical=slot${c.lab_slot_index}, home=${c.home_room}`);
  }

  console.log('\n=== SEED COMPLETE ===');
  console.log(`  Rooms: ${roomsData.length}`);
  console.log(`  Faculty: ${facultyData.length}`);
  console.log(`  SE4 Theory: ${theoryList4.length}, Practicals: ${labList4.length} × 3 = ${labList4.length * 3}`);
  console.log(`  TE6 Theory: ${theoryList6.length}, Practicals: ${labList6.length} × 3 = ${labList6.length * 3}`);
}

main()
  .catch((e) => { console.error('Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());