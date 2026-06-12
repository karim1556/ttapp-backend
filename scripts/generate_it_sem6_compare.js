'use strict';

const prisma = require('../src/config/prisma');
const { generateSchedule } = require('../src/services/timetable.service');

const BRANCH_ID = 2; // IT
const SEMESTER = 6;
const ACAD_YEAR = '2025-26';
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

const REAL_DIV_A = {
  Monday: [
    { time:'09:00-11:00', batch:'A', subject:'BI',   faculty:'NM', room:'Lab 107', type:'Lab' },
    { time:'09:00-11:00', batch:'B', subject:'DSPS', faculty:'AS', room:'Lab 103', type:'Lab' },
    { time:'09:00-11:00', batch:'C', subject:'SNL',  faculty:'PM', room:'Lab 105', type:'Lab' },
    { time:'11:20-12:20', batch:'-', subject:'WT',   faculty:'AP', room:'Room 212', type:'Lecture' },
    { time:'12:20-13:20', batch:'-', subject:'Web X',faculty:'MK', room:'Room 212', type:'Lecture' },
    { time:'14:00-15:00', batch:'-', subject:'AIDS-I',faculty:'AS', room:'Room 212', type:'Lecture' },
  ],
  Tuesday: [
    { time:'09:00-11:00', batch:'A', subject:'WebX', faculty:'MK', room:'Lab 102', type:'Lab' },
    { time:'09:00-11:00', batch:'B', subject:'BI',   faculty:'NM', room:'Lab 107', type:'Lab' },
    { time:'09:00-11:00', batch:'C', subject:'Mini Project', faculty:'VA', room:'Lab 105', type:'Lab' },
    { time:'11:20-12:20', batch:'-', subject:'Web X',faculty:'MK', room:'Room 212', type:'Lecture' },
    { time:'12:20-13:20', batch:'-', subject:'DMBI', faculty:'NM', room:'Room 212', type:'Lecture' },
    { time:'14:00-15:00', batch:'-', subject:'WT',   faculty:'AP', room:'Room 212', type:'Lecture' },
  ],
  Wednesday: [
    { time:'09:00-11:00', batch:'A', subject:'SNL',  faculty:'AP', room:'Lab 105', type:'Lab' },
    { time:'09:00-11:00', batch:'B', subject:'WebX', faculty:'MK', room:'Lab 102', type:'Lab' },
    { time:'09:00-11:00', batch:'C', subject:'BI',   faculty:'NM', room:'Lab 107', type:'Lab' },
    { time:'11:20-12:20', batch:'-', subject:'DMBI', faculty:'NM', room:'Room 212', type:'Lecture' },
    { time:'12:20-13:20', batch:'-', subject:'SA',   faculty:'ML', room:'Room 212', type:'Lecture' },
    { time:'14:00-15:00', batch:'-', subject:'AIDS-I',faculty:'AS', room:'Room 212', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'Mentor-Mentee', faculty:'-', room:'Room 212', type:'Special' },
  ],
  Thursday: [
    { time:'09:00-11:00', batch:'A', subject:'Mini Project', faculty:'NM', room:'Lab 107', type:'Lab' },
    { time:'09:00-11:00', batch:'B', subject:'MAD/PWA',      faculty:'ML', room:'Lab 103', type:'Lab' },
    { time:'09:00-11:00', batch:'C', subject:'DSPS',         faculty:'AS', room:'Lab 112', type:'Lab' },
    { time:'11:20-12:20', batch:'-', subject:'AIDS-I',       faculty:'AS', room:'Room 212', type:'Lecture' },
    { time:'12:20-13:20', batch:'-', subject:'Web X',        faculty:'MK', room:'Room 212', type:'Lecture' },
    { time:'14:00-15:00', batch:'-', subject:'DMBI',         faculty:'NM', room:'Room 212', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'SA',           faculty:'ML', room:'Room 212', type:'Lecture' },
  ],
  Friday: [
    { time:'09:00-11:00', batch:'A', subject:'MAD/PWA',      faculty:'ML', room:'Lab 103', type:'Lab' },
    { time:'09:00-11:00', batch:'B', subject:'Mini Project', faculty:'SB', room:'Lab 101', type:'Lab' },
    { time:'09:00-11:00', batch:'C', subject:'WebX',         faculty:'MK', room:'Lab 102', type:'Lab' },
    { time:'11:20-12:20', batch:'-', subject:'WT',           faculty:'AP', room:'Room 212', type:'Lecture' },
    { time:'12:20-13:20', batch:'-', subject:'SA',           faculty:'ML', room:'Room 212', type:'Lecture' },
    { time:'14:00-15:00', batch:'A', subject:'DSPS',         faculty:'AS', room:'Lab 112', type:'Lab' },
    { time:'14:00-15:00', batch:'B', subject:'SNL',          faculty:'PM', room:'Lab 102', type:'Lab' },
    { time:'14:00-15:00', batch:'C', subject:'MAD/PWA',       faculty:'ML', room:'Lab 103', type:'Lab' },
  ],
};

const REAL_DIV_B = {
  Monday: [
    { time:'09:00-10:00', batch:'-', subject:'WT',     faculty:'AP', room:'Room 212', type:'Lecture' },
    { time:'10:00-11:00', batch:'-', subject:'Web X',  faculty:'MK', room:'Room 212', type:'Lecture' },
    { time:'11:20-13:20', batch:'A', subject:'WebX',   faculty:'AT', room:'Lab 102', type:'Lab' },
    { time:'11:20-13:20', batch:'B', subject:'MAD/PWA',faculty:'ML', room:'Lab 103', type:'Lab' },
    { time:'11:20-13:20', batch:'C', subject:'DSPS',   faculty:'AS', room:'Lab 105', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'DMBI',   faculty:'NM', room:'Room 213', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'SA',     faculty:'ML', room:'Room 213', type:'Lecture' },
  ],
  Tuesday: [
    { time:'09:00-10:00', batch:'-', subject:'AIDS-I',faculty:'AS', room:'Room 212', type:'Lecture' },
    { time:'10:00-11:00', batch:'-', subject:'WT',    faculty:'AP', room:'Room 212', type:'Lecture' },
    { time:'11:20-13:20', batch:'A', subject:'SNL',   faculty:'AP', room:'Lab 105', type:'Lab' },
    { time:'11:20-13:20', batch:'B', subject:'Mini Project', faculty:'AS', room:'Lab 102', type:'Lab' },
    { time:'11:20-13:20', batch:'C', subject:'MAD/PWA',      faculty:'ML', room:'Lab 103', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'SA',     faculty:'ML', room:'Room 213', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'DMBI',   faculty:'NM', room:'Room 213', type:'Lecture' },
  ],
  Wednesday: [
    { time:'09:00-10:00', batch:'-', subject:'SA',     faculty:'ML', room:'Room 212', type:'Lecture' },
    { time:'10:00-11:00', batch:'-', subject:'AIDS-I',faculty:'AS', room:'Room 212', type:'Lecture' },
    { time:'11:20-13:20', batch:'A', subject:'DSPS',   faculty:'AT', room:'Lab 103', type:'Lab' },
    { time:'11:20-13:20', batch:'B', subject:'SNL',    faculty:'PM', room:'Lab 105', type:'Lab' },
    { time:'11:20-13:20', batch:'C', subject:'BI',     faculty:'SB', room:'Lab 107', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'DMBI',   faculty:'NM', room:'Room 213', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'Mentor-Mentee', faculty:'-', room:'Room 213', type:'Special' },
  ],
  Thursday: [
    { time:'09:00-10:00', batch:'-', subject:'Web X',  faculty:'MK', room:'Room 212', type:'Lecture' },
    { time:'10:00-11:00', batch:'-', subject:'WT',     faculty:'AP', room:'Room 212', type:'Lecture' },
    { time:'11:20-13:20', batch:'A', subject:'MAD/PWA',faculty:'ML', room:'Lab 103', type:'Lab' },
    { time:'11:20-13:20', batch:'B', subject:'WebX',   faculty:'AT', room:'Lab 102', type:'Lab' },
    { time:'11:20-13:20', batch:'C', subject:'SNL',    faculty:'AP', room:'Lab 105', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'AIDS-I', faculty:'AS', room:'Room 213', type:'Lecture' },
  ],
  Friday: [
    { time:'09:00-11:00', batch:'A', subject:'BI',     faculty:'NM', room:'Lab 107', type:'Lab' },
    { time:'09:00-11:00', batch:'B', subject:'DSPS',   faculty:'AT', room:'Lab 105', type:'Lab' },
    { time:'09:00-11:00', batch:'C', subject:'Mini Project', faculty:'NS', room:'Lab 112', type:'Lab' },
    { time:'11:20-13:20', batch:'A', subject:'Mini Project', faculty:'MK', room:'Lab 107', type:'Lab' },
    { time:'11:20-13:20', batch:'B', subject:'BI',     faculty:'SB', room:'Lab 107', type:'Lab' },
    { time:'11:20-13:20', batch:'C', subject:'WebX',    faculty:'AT', room:'Lab 102', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'Web X',  faculty:'MK', room:'Room 212', type:'Lecture' },
  ],
};

function formatTime(h, m) {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function printGeneratedTimetable(timetables, subjectMap, facultyMap) {
  const dayMap = {};
  for (const tt of timetables) {
    dayMap[tt.dateOfWeek] = tt;
  }

  for (const day of DAYS) {
    const tt = dayMap[day];
    if (!tt) { console.log(`  ${day}: (no data)`); continue; }
    console.log(`\n  ── ${day} ──`);
    for (const slot of (tt.time_details || [])) {
      const t = `${formatTime(slot.startTimeHr, slot.startTimeMinutes)}-${formatTime(slot.endTimeHr, slot.endTimeMinutes)}`;
      for (const lec of (slot.batch_subjects || [])) {
        const subj = subjectMap[lec.subjectCode] || lec.subjectCode || '?';
        const fac  = facultyMap[Number(lec.facultyid)] || `id:${lec.facultyid}`;
        const batch = lec.batch ? `[${lec.batch}]` : '   ';
        const type  = lec.typeOfLecture === 'Lab' ? 'Lab' : 'Lec';
        const room  = lec.room_number || '?';
        console.log(`    ${t}  ${batch}  ${type}  ${(lec.subjectCode||'?').padEnd(14)}  ${fac.padEnd(25)}  Room:${room}`);
      }
    }
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  IT Dept — TE Sem VI — AUTO-GENERATE using algorithm');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const admin = await prisma.user.findFirst({
    where: { user_type: 1 },
    orderBy: { uid: 'asc' },
    select: { uid: true },
  });
  if (!admin) throw new Error('No admin user found.');

  console.log('Running algorithm for IT Sem 6, Div A & B...\n');

  const result = await generateSchedule({
    branchId:    BRANCH_ID,
    sem:         SEMESTER,
    division:    'A',
    academicYear:ACAD_YEAR,
    createdBy:   admin.uid,
    attempts:    30,
  });

  console.log('Div A generation result:');
  console.log(`  slotsAssigned:      ${result.slotsAssigned}`);
  console.log(`  unplacedLectures:   ${result.optimization?.unplacedLectures}`);

  const result2 = await generateSchedule({
    branchId:    BRANCH_ID,
    sem:         SEMESTER,
    division:    'B',
    academicYear:ACAD_YEAR,
    createdBy:   admin.uid,
    attempts:    30,
  });

  console.log('\nDiv B generation result:');
  console.log(`  slotsAssigned:      ${result2.slotsAssigned}`);
  console.log(`  unplacedLectures:   ${result2.optimization?.unplacedLectures}`);

  // Fetch the newly generated timetable rows
  const timetables = await prisma.tblTimeTable.findMany({
    where: { branch_id: BRANCH_ID, sem: String(SEMESTER) },
    include: {
      time_details: {
        include: { batch_subjects: true },
        orderBy: [{ startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
      },
    },
    orderBy: { dateOfWeek: 'asc' },
  });

  const subjectCodes = new Set();
  const facultyIds   = new Set();
  for (const tt of timetables) {
    for (const s of tt.time_details) {
      for (const l of s.batch_subjects) {
        if (l.subjectCode) subjectCodes.add(l.subjectCode);
        if (l.facultyid)   facultyIds.add(Number(l.facultyid));
      }
    }
  }

  const [subs, facs] = await Promise.all([
    prisma.subject.findMany({ where: { subject_code: { in: [...subjectCodes] } }, select: { subject_code:true, subject_name:true } }),
    prisma.faculty.findMany({ where: { faculty_id: { in: [...facultyIds] } }, select: { faculty_id:true, name:true } }),
  ]);
  const subjectMap  = Object.fromEntries(subs.map(s => [s.subject_code, s.subject_name]));
  const facultyMap  = Object.fromEntries(facs.map(f => [f.faculty_id, f.name]));

  const divA = timetables.filter(t => t.division === 'A').sort((a,b) => DAYS.indexOf(a.dateOfWeek) - DAYS.indexOf(b.dateOfWeek));
  const divB = timetables.filter(t => t.division === 'B').sort((a,b) => DAYS.indexOf(a.dateOfWeek) - DAYS.indexOf(b.dateOfWeek));

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GENERATED — DIV A                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  printGeneratedTimetable(divA, subjectMap, facultyMap);

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  REAL COLLEGE — DIV A (for comparison)                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  for (const day of DAYS) {
    console.log(`\n  ── ${day} ──`);
    for (const s of REAL_DIV_A[day] || []) {
      const batch = s.batch !== '-' ? `[${s.batch}]` : '   ';
      const type  = s.type === 'Lab' ? 'Lab' : 'Lec';
      console.log(`    ${s.time}  ${batch}  ${type}  ${s.subject.padEnd(14)}  ${s.faculty.padEnd(25)}  Room:${s.room}`);
    }
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GENERATED — DIV B                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  printGeneratedTimetable(divB, subjectMap, facultyMap);

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  REAL COLLEGE — DIV B (for comparison)                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  for (const day of DAYS) {
    console.log(`\n  ── ${day} ──`);
    for (const s of REAL_DIV_B[day] || []) {
      const batch = s.batch !== '-' ? `[${s.batch}]` : '   ';
      const type  = s.type === 'Lab' ? 'Lab' : 'Lec';
      console.log(`    ${s.time}  ${batch}  ${type}  ${s.subject.padEnd(14)}  ${s.faculty.padEnd(25)}  Room:${s.room}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Comparison complete!');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main()
  .catch(e => { console.error('Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
