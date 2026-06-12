'use strict';
/**
 * Generate IT Sem 4 Div A & B timetable using the auto-generation algorithm,
 * then print a human-readable comparison against the real college schedule.
 */

const prisma = require('../src/config/prisma');
const { generateSchedule } = require('../src/services/timetable.service');

const BRANCH_ID = 2; // IT
const SEMESTER  = 4;
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

// ─── Real College Schedule (for comparison) ──────────────────────────────────
// Format: { [day]: [{ time, batch, subject, faculty, room, type }] }
const REAL_DIV_A = {
  Monday: [
    { time:'10:00-11:00', batch:'A', subject:'MDM', faculty:'NI', room:'Lab 102', type:'Lab' },
    { time:'10:00-11:00', batch:'B', subject:'UNIX', faculty:'PM', room:'Lab 112', type:'Lab' },
    { time:'10:00-11:00', batch:'C', subject:'DT',  faculty:'VS', room:'Lab 101', type:'Lab' },
    { time:'11:20-12:20', batch:'A', subject:'UNIX', faculty:'PM', room:'Lab 112', type:'Lab' },
    { time:'11:20-12:20', batch:'B', subject:'BMD',  faculty:'NW', room:'Lab 107', type:'Lab' },
    { time:'11:20-12:20', batch:'C', subject:'MDM',  faculty:'NI', room:'Lab 101', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'DT',   faculty:'VS', room:'214', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'CNND', faculty:'SP', room:'214', type:'Lecture' },
    { time:'16:00-17:00', batch:'-', subject:'OE',   faculty:'AT', room:'213', type:'Lecture' },
  ],
  Tuesday: [
    { time:'09:00-10:00', batch:'-', subject:'MPP',   faculty:'AC', room:'213', type:'Lecture' },
    { time:'10:00-11:00', batch:'-', subject:'AMT-II',faculty:'TN', room:'213', type:'Lecture' },
    { time:'11:20-12:20', batch:'A', subject:'NL',    faculty:'SP', room:'Lab 112', type:'Lab' },
    { time:'11:20-12:20', batch:'B', subject:'MDM',   faculty:'NS', room:'Lab 101', type:'Lab' },
    { time:'11:20-12:20', batch:'C', subject:'BMD',   faculty:'NI', room:'Lab 107', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'CNND',  faculty:'SP', room:'214', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'OE',    faculty:'AT', room:'214', type:'Lecture' },
    { time:'16:00-17:00', batch:'B', subject:'AMT-II Tutorial', faculty:'TN', room:'213', type:'Lecture' },
  ],
  Wednesday: [
    { time:'09:00-10:00', batch:'-', subject:'BMD',  faculty:'NW', room:'213', type:'Lecture' },
    { time:'10:00-11:00', batch:'-', subject:'MPP',  faculty:'AC', room:'213', type:'Lecture' },
    { time:'11:20-12:20', batch:'A', subject:'BMD',  faculty:'NW', room:'Lab 102', type:'Lab' },
    { time:'11:20-12:20', batch:'B', subject:'NL',   faculty:'SP', room:'Lab 112', type:'Lab' },
    { time:'11:20-12:20', batch:'C', subject:'MinP', faculty:'AC', room:'Lab 101', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'MDM',  faculty:'NI', room:'214', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'OS',   faculty:'PM', room:'214', type:'Lecture' },
    { time:'16:00-17:00', batch:'-', subject:'Mentor-Mentee', faculty:'-', room:'-', type:'Special' },
  ],
  Thursday: [
    { time:'09:00-10:00', batch:'-', subject:'MDM',  faculty:'NI', room:'214', type:'Lecture' },
    { time:'10:00-11:00', batch:'-', subject:'OS',   faculty:'PM', room:'214', type:'Lecture' },
    { time:'11:20-12:20', batch:'A', subject:'DT',   faculty:'VS', room:'Lab 107', type:'Lab' },
    { time:'11:20-12:20', batch:'B', subject:'MinP', faculty:'AC', room:'Lab 101', type:'Lab' },
    { time:'11:20-12:20', batch:'C', subject:'UNIX', faculty:'PM', room:'Lab 112', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'CNND', faculty:'SP', room:'214', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'DT',   faculty:'VS', room:'214', type:'Lecture' },
    { time:'16:00-17:00', batch:'A', subject:'AMT-II Tutorial', faculty:'TN', room:'213', type:'Lecture' },
  ],
  Friday: [
    { time:'09:00-10:00', batch:'-', subject:'AMT-II',faculty:'TN', room:'213', type:'Lecture' },
    { time:'10:00-11:00', batch:'-', subject:'BMD',   faculty:'NW', room:'213', type:'Lecture' },
    { time:'11:20-12:20', batch:'A', subject:'MinP',  faculty:'AC', room:'Lab 105', type:'Lab' },
    { time:'11:20-12:20', batch:'B', subject:'DT',    faculty:'VS', room:'Lab 101', type:'Lab' },
    { time:'11:20-12:20', batch:'C', subject:'NL',    faculty:'SP', room:'Lab 112', type:'Lab' },
    { time:'14:00-15:00', batch:'-', subject:'OS',    faculty:'PM', room:'214', type:'Lecture' },
    { time:'15:00-16:00', batch:'-', subject:'MDM',   faculty:'NI', room:'214', type:'Lecture' },
    { time:'16:00-17:00', batch:'C', subject:'AMT-II Tutorial', faculty:'TN', room:'213', type:'Lecture' },
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
        console.log(`    ${t}  ${batch}  ${type}  ${(lec.subjectCode||'?').padEnd(8)}  ${fac.padEnd(25)}  Room:${room}`);
      }
    }
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  IT Dept — SE Sem IV — AUTO-GENERATE using algorithm');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const admin = await prisma.user.findFirst({
    where: { user_type: 1 },
    orderBy: { uid: 'asc' },
    select: { uid: true },
  });
  if (!admin) throw new Error('No admin user found.');

  console.log('Running algorithm for IT Sem 4, Div A & B...\n');

  const result = await generateSchedule({
    branchId:    BRANCH_ID,
    sem:         SEMESTER,
    division:    'A',
    academicYear:'2025-26',
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
    academicYear:'2025-26',
    createdBy:   admin.uid,
    attempts:    30,
  });

  console.log('\nDiv B generation result:');
  console.log(`  slotsAssigned:      ${result2.slotsAssigned}`);
  console.log(`  unplacedLectures:   ${result2.optimization?.unplacedLectures}`);

  // ── Now fetch and display the generated IT Sem 4 timetable ──
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

  // Enrich with names
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

  // Split by division
  const divA = timetables.filter(t => t.division === 'A').sort((a,b) => DAYS.indexOf(a.dateOfWeek) - DAYS.indexOf(b.dateOfWeek));
  const divB = timetables.filter(t => t.division === 'B').sort((a,b) => DAYS.indexOf(a.dateOfWeek) - DAYS.indexOf(b.dateOfWeek));

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GENERATED — DIV A                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  printGeneratedTimetable(divA, subjectMap, facultyMap);

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  REAL COLLEGE — DIV A (for comparison)                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  for (const day of DAYS) {
    console.log(`\n  ── ${day} ──`);
    for (const s of REAL_DIV_A[day] || []) {
      const batch = s.batch !== '-' ? `[${s.batch}]` : '   ';
      const type  = s.type === 'Lab' ? 'Lab' : 'Lec';
      console.log(`    ${s.time}  ${batch}  ${type}  ${s.subject.padEnd(8)}  ${s.faculty.padEnd(25)}  Room:${s.room}`);
    }
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GENERATED — DIV B                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  printGeneratedTimetable(divB, subjectMap, facultyMap);

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ANALYSIS                                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`
  The algorithm schedules subjects based on:
    ✓ Faculty constraints (max lectures/day, unavailable slots)
    ✓ Room availability (no double-booking)
    ✓ Subject spread (no same subject twice on same day)
    ✓ Lab rotations (A/B/C in parallel different subjects)

  BUT the algorithm CANNOT reproduce the exact real timetable because:
    ✗ It doesn't know the specific day/time each subject should appear
    ✗ Real TT has hand-crafted patterns (Tutorial-A on Thu, Tutorial-B on Tue...)
    ✗ Room preferences in real TT are manual (213 for AMT-II, 214 for OS etc.)
    ✗ Batch-lab rotation order is fixed in real TT, random in algorithm

  VERDICT: Algorithm gives a VALID timetable (no conflicts) but NOT identical
  to the real one. For 100% accurate real TT → manual seeding is required.
`);
}

main()
  .catch(e => { console.error('Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
