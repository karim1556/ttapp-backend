'use strict';

/**
 * VASANTDADA PATIL PRATISHTHAN'S COLLEGE OF ENGINEERING & VISUAL ARTS, MUMBAI
 * IT Department — SE SEM IV — Div A & Div B
 * Exact manual timetable seed (does NOT use auto-generator).
 *
 * Faculty short codes → names:
 *   NI = Prof. Nitin Ingale
 *   PM = Prof. Priya Mane
 *   VS = Dr. Vinod Sakpal       (Class Advisor Div A)
 *   NW = Prof. Nilesh Wadekar
 *   SP = Prof. Sandip Patil
 *   AT = Prof. Atul Tarwade
 *   AC = Prof. Ankur Chavan     (Class Advisor Div B)
 *   TN = Prof. Tejaswini Naik
 *   DM = Prof. Deepak Mane
 *   NS = Prof. Nilesh Satpute
 */

const prisma = require('../src/config/prisma');

const BRANCH_ID    = 2;   // IT
const SEMESTER     = 4;
const ACAD_YEAR    = '2025-26';
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Faculty short-code → full name
// ─────────────────────────────────────────────────────────────────────────────
const FACULTY_DEFS = [
  { code: 'NI', name: 'Prof. Nitin Ingale',    email: 'ni.it@ttapp.com' },
  { code: 'PM', name: 'Prof. Priya Mane',       email: 'pm.it@ttapp.com' },
  { code: 'VS', name: 'Dr. Vinod Sakpal',       email: 'vs.it@ttapp.com' },
  { code: 'NW', name: 'Prof. Nilesh Wadekar',   email: 'nw.it@ttapp.com' },
  { code: 'SP', name: 'Prof. Sandip Patil',     email: 'sp.it@ttapp.com' },
  { code: 'AT', name: 'Prof. Atul Tarwade',     email: 'at.it@ttapp.com' },
  { code: 'AC', name: 'Prof. Ankur Chavan',     email: 'ac.it@ttapp.com' },
  { code: 'TN', name: 'Prof. Tejaswini Naik',   email: 'tn.it@ttapp.com' },
  { code: 'DM', name: 'Prof. Deepak Mane',      email: 'dm.it@ttapp.com' },
  { code: 'NS', name: 'Prof. Nilesh Satpute',   email: 'ns.it@ttapp.com' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. Rooms (add if they don't exist)
// ─────────────────────────────────────────────────────────────────────────────
const ROOMS = [
  { room_number: '101', name: 'Lab 101',  room_type: 'Lab',       capacity: 40, is_active: 1 },
  { room_number: '102', name: 'Lab 102',  room_type: 'Lab',       capacity: 40, is_active: 1 },
  { room_number: '105', name: 'Lab 105',  room_type: 'Lab',       capacity: 40, is_active: 1 },
  { room_number: '107', name: 'Lab 107',  room_type: 'Lab',       capacity: 40, is_active: 1 },
  { room_number: '112', name: 'Lab 112',  room_type: 'Lab',       capacity: 40, is_active: 1 },
  { room_number: '213', name: 'Room 213', room_type: 'Classroom', capacity: 60, is_active: 1 },
  { room_number: '214', name: 'Room 214', room_type: 'Classroom', capacity: 60, is_active: 1 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. IT Sem 4 subjects
//    For lab subjects, batch variants share the same base subject_code
//    but each batch entry has a per-batch code (e.g. UNIX-A) so the subject
//    can carry a professor_assign. Theory subjects use the plain code.
// ─────────────────────────────────────────────────────────────────────────────
const SUBJECTS = [
  // ── Theory ──────────────────────────────────────────────────────────────
  { code: 'AMT-II', name: 'Applied Mathematics Thinking-II',   faculty: 'TN', isLab: false, credits: 3 },
  { code: 'OS',     name: 'Operating System',                   faculty: 'PM', isLab: false, credits: 3 },
  { code: 'CNND',   name: 'Computer Network & Network Design',  faculty: 'SP', isLab: false, credits: 3 },
  { code: 'MDM',    name: 'Multidisciplinary Minor',            faculty: 'NI', isLab: false, credits: 2 },
  { code: 'OE',     name: 'Open Elective',                      faculty: 'AT', isLab: false, credits: 2 },
  { code: 'BMD',    name: 'Business Model Development',         faculty: 'NW', isLab: false, credits: 2 },
  { code: 'DT',     name: 'Design Thinking',                    faculty: 'VS', isLab: false, credits: 2 },
  { code: 'MPP',    name: 'Mini Project – Programming Paradigm',faculty: 'AC', isLab: false, credits: 2 },

  // ── Labs (batch-specific) ───────────────────────────────────────────────
  { code: 'UNIX-A', name: 'Unix Lab (Batch A)',             faculty: 'PM', isLab: true, credits: 1 },
  { code: 'UNIX-B', name: 'Unix Lab (Batch B)',             faculty: 'PM', isLab: true, credits: 1 },
  { code: 'UNIX-C', name: 'Unix Lab (Batch C)',             faculty: 'PM', isLab: true, credits: 1 },
  { code: 'NL-A',   name: 'Network Design Lab (Batch A)',   faculty: 'SP', isLab: true, credits: 1 },
  { code: 'NL-B',   name: 'Network Design Lab (Batch B)',   faculty: 'SP', isLab: true, credits: 1 },
  { code: 'NL-C',   name: 'Network Design Lab (Batch C)',   faculty: 'SP', isLab: true, credits: 1 },
  { code: 'MDM-A',  name: 'MDM Lab (Batch A)',              faculty: 'NI', isLab: true, credits: 1 },
  { code: 'MDM-B',  name: 'MDM Lab (Batch B)',              faculty: 'NS', isLab: true, credits: 1 },
  { code: 'MDM-C',  name: 'MDM Lab (Batch C)',              faculty: 'NI', isLab: true, credits: 1 },
  { code: 'BMD-A',  name: 'BMD Lab (Batch A)',              faculty: 'NW', isLab: true, credits: 1 },
  { code: 'BMD-B',  name: 'BMD Lab (Batch B)',              faculty: 'NW', isLab: true, credits: 1 },
  { code: 'BMD-C',  name: 'BMD Lab (Batch C)',              faculty: 'NW', isLab: true, credits: 1 },
  { code: 'DT-A',   name: 'Design Thinking Lab (Batch A)', faculty: 'VS', isLab: true, credits: 1 },
  { code: 'DT-B',   name: 'Design Thinking Lab (Batch B)', faculty: 'VS', isLab: true, credits: 1 },
  { code: 'DT-C',   name: 'Design Thinking Lab (Batch C)', faculty: 'VS', isLab: true, credits: 1 },
  { code: 'MinP-A', name: 'Mini Project Lab (Batch A)',     faculty: 'AC', isLab: true, credits: 1 },
  { code: 'MinP-B', name: 'Mini Project Lab (Batch B)',     faculty: 'AC', isLab: true, credits: 1 },
  { code: 'MinP-C', name: 'Mini Project Lab (Batch C)',     faculty: 'AC', isLab: true, credits: 1 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. Timetable definitions
//    Each slot: { start:[h,m], end:[h,m], lectures:[...] }
//    Each lecture: { batch: null|'A'|'B'|'C', subjectCode, faculty, room, type:'Lecture'|'Lab' }
//    2-hour labs are expressed as TWO identical consecutive slots.
// ─────────────────────────────────────────────────────────────────────────────

const DIV_A = {
  Monday: [
    // 10:00–11:00  Batch lab rotation
    { start:[10,0], end:[11,0], lectures:[
      { batch:'A', subjectCode:'MDM-A',  faculty:'NI', room:'102', type:'Lab' },
      { batch:'B', subjectCode:'UNIX-B', faculty:'PM', room:'112', type:'Lab' },
      { batch:'C', subjectCode:'DT-C',   faculty:'VS', room:'101', type:'Lab' },
    ]},
    // 11:20–12:20  Batch lab rotation (2nd half)
    { start:[11,20], end:[12,20], lectures:[
      { batch:'A', subjectCode:'UNIX-A', faculty:'PM', room:'112', type:'Lab' },
      { batch:'B', subjectCode:'BMD-B',  faculty:'NW', room:'107', type:'Lab' },
      { batch:'C', subjectCode:'MDM-C',  faculty:'NI', room:'101', type:'Lab' },
    ]},
    // 14:00–15:00  Full class
    { start:[14,0], end:[15,0], lectures:[{ batch:null, subjectCode:'DT',   faculty:'VS', room:'214', type:'Lecture' }]},
    // 15:00–16:00
    { start:[15,0], end:[16,0], lectures:[{ batch:null, subjectCode:'CNND', faculty:'SP', room:'214', type:'Lecture' }]},
    // 16:00–17:00
    { start:[16,0], end:[17,0], lectures:[{ batch:null, subjectCode:'OE',   faculty:'AT', room:'213', type:'Lecture' }]},
  ],

  Tuesday: [
    { start:[9,0],  end:[10,0],  lectures:[{ batch:null, subjectCode:'MPP',   faculty:'AC', room:'213', type:'Lecture' }]},
    { start:[10,0], end:[11,0],  lectures:[{ batch:null, subjectCode:'AMT-II',faculty:'TN', room:'213', type:'Lecture' }]},
    // 11:20–12:20  Batch lab
    { start:[11,20], end:[12,20], lectures:[
      { batch:'A', subjectCode:'NL-A',  faculty:'SP', room:'112', type:'Lab' },
      { batch:'B', subjectCode:'MDM-B', faculty:'NS', room:'101', type:'Lab' },
      { batch:'C', subjectCode:'BMD-C', faculty:'NI', room:'107', type:'Lab' },
    ]},
    { start:[14,0], end:[15,0], lectures:[{ batch:null, subjectCode:'CNND',  faculty:'SP', room:'214', type:'Lecture' }]},
    { start:[15,0], end:[16,0], lectures:[{ batch:null, subjectCode:'OE',    faculty:'AT', room:'214', type:'Lecture' }]},
    // 16:00–17:00  AMT-II Tutorial – Batch B
    { start:[16,0], end:[17,0], lectures:[{ batch:'B', subjectCode:'AMT-II', faculty:'TN', room:'213', type:'Lecture' }]},
  ],

  Wednesday: [
    { start:[9,0],  end:[10,0],  lectures:[{ batch:null, subjectCode:'BMD', faculty:'NW', room:'213', type:'Lecture' }]},
    { start:[10,0], end:[11,0],  lectures:[{ batch:null, subjectCode:'MPP', faculty:'AC', room:'213', type:'Lecture' }]},
    // 11:20–12:20  Batch lab
    { start:[11,20], end:[12,20], lectures:[
      { batch:'A', subjectCode:'BMD-A',  faculty:'NW', room:'102', type:'Lab' },
      { batch:'B', subjectCode:'NL-B',   faculty:'SP', room:'112', type:'Lab' },
      { batch:'C', subjectCode:'MinP-C', faculty:'AC', room:'101', type:'Lab' },
    ]},
    { start:[14,0], end:[15,0], lectures:[{ batch:null, subjectCode:'MDM', faculty:'NI', room:'214', type:'Lecture' }]},
    { start:[15,0], end:[16,0], lectures:[{ batch:null, subjectCode:'OS',  faculty:'PM', room:'214', type:'Lecture' }]},
    // 16:00–17:00  Mentor–Mentee (no subject/faculty – omitted from schedule)
  ],

  Thursday: [
    { start:[9,0],  end:[10,0],  lectures:[{ batch:null, subjectCode:'MDM',   faculty:'NI', room:'214', type:'Lecture' }]},
    { start:[10,0], end:[11,0],  lectures:[{ batch:null, subjectCode:'OS',    faculty:'PM', room:'214', type:'Lecture' }]},
    // 11:20–12:20  Batch lab
    { start:[11,20], end:[12,20], lectures:[
      { batch:'A', subjectCode:'DT-A',   faculty:'VS', room:'107', type:'Lab' },
      { batch:'B', subjectCode:'MinP-B', faculty:'AC', room:'101', type:'Lab' },
      { batch:'C', subjectCode:'UNIX-C', faculty:'PM', room:'112', type:'Lab' },
    ]},
    { start:[14,0], end:[15,0], lectures:[{ batch:null, subjectCode:'CNND', faculty:'SP', room:'214', type:'Lecture' }]},
    { start:[15,0], end:[16,0], lectures:[{ batch:null, subjectCode:'DT',   faculty:'VS', room:'214', type:'Lecture' }]},
    // 16:00–17:00  AMT-II Tutorial – Batch A
    { start:[16,0], end:[17,0], lectures:[{ batch:'A', subjectCode:'AMT-II', faculty:'TN', room:'213', type:'Lecture' }]},
  ],

  Friday: [
    { start:[9,0],  end:[10,0],  lectures:[{ batch:null, subjectCode:'AMT-II', faculty:'TN', room:'213', type:'Lecture' }]},
    { start:[10,0], end:[11,0],  lectures:[{ batch:null, subjectCode:'BMD',    faculty:'NW', room:'213', type:'Lecture' }]},
    // 11:20–12:20  Batch lab
    { start:[11,20], end:[12,20], lectures:[
      { batch:'A', subjectCode:'MinP-A', faculty:'AC', room:'105', type:'Lab' },
      { batch:'B', subjectCode:'DT-B',   faculty:'VS', room:'101', type:'Lab' },
      { batch:'C', subjectCode:'NL-C',   faculty:'SP', room:'112', type:'Lab' },
    ]},
    { start:[14,0], end:[15,0], lectures:[{ batch:null, subjectCode:'OS',  faculty:'PM', room:'214', type:'Lecture' }]},
    { start:[15,0], end:[16,0], lectures:[{ batch:null, subjectCode:'MDM', faculty:'NI', room:'214', type:'Lecture' }]},
    // 16:00–17:00  AMT-II Tutorial – Batch C
    { start:[16,0], end:[17,0], lectures:[{ batch:'C', subjectCode:'AMT-II', faculty:'TN', room:'213', type:'Lecture' }]},
  ],
};

const DIV_B = {
  Monday: [
    { start:[9,0],   end:[10,0],  lectures:[{ batch:null, subjectCode:'BMD',    faculty:'NW', room:'214', type:'Lecture' }]},
    { start:[10,0],  end:[11,0],  lectures:[{ batch:null, subjectCode:'OE',     faculty:'AT', room:'214', type:'Lecture' }]},
    { start:[11,20], end:[12,20], lectures:[{ batch:null, subjectCode:'AMT-II', faculty:'TN', room:'214', type:'Lecture' }]},
    { start:[12,20], end:[13,20], lectures:[{ batch:null, subjectCode:'DT',     faculty:'VS', room:'214', type:'Lecture' }]},
    // 14:00–16:00  2-hr batch lab (two consecutive slots)
    { start:[14,0], end:[15,0], lectures:[
      { batch:'A', subjectCode:'BMD-A', faculty:'NW', room:'105', type:'Lab' },
      { batch:'B', subjectCode:'NL-B',  faculty:'SP', room:'112', type:'Lab' },
      { batch:'C', subjectCode:'MDM-C', faculty:'NI', room:'101', type:'Lab' },
    ]},
    { start:[15,0], end:[16,0], lectures:[
      { batch:'A', subjectCode:'BMD-A', faculty:'NW', room:'105', type:'Lab' },
      { batch:'B', subjectCode:'NL-B',  faculty:'SP', room:'112', type:'Lab' },
      { batch:'C', subjectCode:'MDM-C', faculty:'NI', room:'101', type:'Lab' },
    ]},
    // 16:00–17:00  AMT-II Tutorial – Batch A
    { start:[16,0], end:[17,0], lectures:[{ batch:'A', subjectCode:'AMT-II', faculty:'TN', room:'214', type:'Lecture' }]},
  ],

  Tuesday: [
    { start:[9,0],   end:[10,0],  lectures:[{ batch:null, subjectCode:'BMD',    faculty:'NW', room:'214', type:'Lecture' }]},
    { start:[10,0],  end:[11,0],  lectures:[{ batch:null, subjectCode:'OE',     faculty:'AT', room:'214', type:'Lecture' }]},
    { start:[11,20], end:[12,20], lectures:[{ batch:null, subjectCode:'MPP',    faculty:'AC', room:'214', type:'Lecture' }]},
    { start:[12,20], end:[13,20], lectures:[{ batch:null, subjectCode:'OS',     faculty:'PM', room:'214', type:'Lecture' }]},
    // 14:00–16:00  2-hr batch lab
    { start:[14,0], end:[15,0], lectures:[
      { batch:'A', subjectCode:'UNIX-A', faculty:'PM', room:'112', type:'Lab' },
      { batch:'B', subjectCode:'DT-B',   faculty:'VS', room:'107', type:'Lab' },
      { batch:'C', subjectCode:'BMD-C',  faculty:'NW', room:'101', type:'Lab' },
    ]},
    { start:[15,0], end:[16,0], lectures:[
      { batch:'A', subjectCode:'UNIX-A', faculty:'PM', room:'112', type:'Lab' },
      { batch:'B', subjectCode:'DT-B',   faculty:'VS', room:'107', type:'Lab' },
      { batch:'C', subjectCode:'BMD-C',  faculty:'NW', room:'101', type:'Lab' },
    ]},
    // 16:00–17:00  AMT-II Tutorial – Batch B
    { start:[16,0], end:[17,0], lectures:[{ batch:'B', subjectCode:'AMT-II', faculty:'TN', room:'214', type:'Lecture' }]},
  ],

  Wednesday: [
    { start:[9,0],   end:[10,0],  lectures:[{ batch:null, subjectCode:'MPP',  faculty:'AC', room:'214', type:'Lecture' }]},
    { start:[10,0],  end:[11,0],  lectures:[{ batch:null, subjectCode:'CNND', faculty:'SP', room:'214', type:'Lecture' }]},
    { start:[11,20], end:[12,20], lectures:[{ batch:null, subjectCode:'OS',   faculty:'PM', room:'214', type:'Lecture' }]},
    { start:[12,20], end:[13,20], lectures:[{ batch:null, subjectCode:'MDM',  faculty:'NI', room:'214', type:'Lecture' }]},
    // 14:00–16:00  2-hr batch lab
    { start:[14,0], end:[15,0], lectures:[
      { batch:'A', subjectCode:'NL-A',   faculty:'SP', room:'112', type:'Lab' },
      { batch:'B', subjectCode:'BMD-B',  faculty:'NW', room:'107', type:'Lab' },
      { batch:'C', subjectCode:'MinP-C', faculty:'AC', room:'101', type:'Lab' },
    ]},
    { start:[15,0], end:[16,0], lectures:[
      { batch:'A', subjectCode:'NL-A',   faculty:'SP', room:'112', type:'Lab' },
      { batch:'B', subjectCode:'BMD-B',  faculty:'NW', room:'107', type:'Lab' },
      { batch:'C', subjectCode:'MinP-C', faculty:'AC', room:'101', type:'Lab' },
    ]},
    // 16:00–17:00  Mentor–Mentee (omitted)
  ],

  Thursday: [
    // 09:00–11:00  2-hr batch lab
    { start:[9,0],  end:[10,0], lectures:[
      { batch:'A', subjectCode:'MinP-A', faculty:'AC', room:'101', type:'Lab' },
      { batch:'B', subjectCode:'MDM-B',  faculty:'NS', room:'102', type:'Lab' },
      { batch:'C', subjectCode:'DT-C',   faculty:'VS', room:'105', type:'Lab' },
    ]},
    { start:[10,0], end:[11,0], lectures:[
      { batch:'A', subjectCode:'MinP-A', faculty:'AC', room:'101', type:'Lab' },
      { batch:'B', subjectCode:'MDM-B',  faculty:'NS', room:'102', type:'Lab' },
      { batch:'C', subjectCode:'DT-C',   faculty:'VS', room:'105', type:'Lab' },
    ]},
    { start:[11,20], end:[12,20], lectures:[{ batch:null, subjectCode:'CNND', faculty:'SP', room:'214', type:'Lecture' }]},
    { start:[12,20], end:[13,20], lectures:[{ batch:null, subjectCode:'MDM',  faculty:'NI', room:'214', type:'Lecture' }]},
    { start:[14,0],  end:[15,0],  lectures:[{ batch:null, subjectCode:'CNND', faculty:'SP', room:'214', type:'Lecture' }]},
    { start:[15,0],  end:[16,0],  lectures:[{ batch:null, subjectCode:'DT',   faculty:'VS', room:'214', type:'Lecture' }]},
    // 16:00–17:00  AMT-II Tutorial – Batch C
    { start:[16,0],  end:[17,0],  lectures:[{ batch:'C', subjectCode:'AMT-II', faculty:'TN', room:'214', type:'Lecture' }]},
  ],

  Friday: [
    { start:[9,0],   end:[10,0],  lectures:[{ batch:null, subjectCode:'CNND',   faculty:'SP', room:'214', type:'Lecture' }]},
    { start:[10,0],  end:[11,0],  lectures:[{ batch:null, subjectCode:'DT',     faculty:'VS', room:'214', type:'Lecture' }]},
    { start:[11,20], end:[12,20], lectures:[{ batch:null, subjectCode:'OS',     faculty:'PM', room:'214', type:'Lecture' }]},
    { start:[12,20], end:[13,20], lectures:[{ batch:null, subjectCode:'AMT-II', faculty:'TN', room:'214', type:'Lecture' }]},
    // 14:00–16:00  2-hr batch lab
    { start:[14,0], end:[15,0], lectures:[
      { batch:'A', subjectCode:'DT-A',   faculty:'VS', room:'101', type:'Lab' },
      { batch:'B', subjectCode:'UNIX-B', faculty:'AC', room:'105', type:'Lab' },
      { batch:'C', subjectCode:'NL-C',   faculty:'AT', room:'107', type:'Lab' },
    ]},
    { start:[15,0], end:[16,0], lectures:[
      { batch:'A', subjectCode:'DT-A',   faculty:'VS', room:'101', type:'Lab' },
      { batch:'B', subjectCode:'UNIX-B', faculty:'AC', room:'105', type:'Lab' },
      { batch:'C', subjectCode:'NL-C',   faculty:'AT', room:'107', type:'Lab' },
    ]},
    { start:[16,0], end:[17,0], lectures:[{ batch:null, subjectCode:'MDM', faculty:'NI', room:'214', type:'Lecture' }]},
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function upsertRooms() {
  let added = 0;
  for (const r of ROOMS) {
    const existing = await prisma.room.findFirst({ where: { room_number: r.room_number } });
    if (!existing) {
      await prisma.room.create({ data: r });
      added++;
    }
  }
  console.log(`  Rooms: ${added} added, ${ROOMS.length - added} already existed.`);
}

async function upsertITFaculty() {
  const map = {}; // code → faculty_id
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('teach123', 10);

  for (const f of FACULTY_DEFS) {
    // Check by email
    let faculty = await prisma.faculty.findFirst({ where: { email: f.email } });
    if (!faculty) {
      // Create user first
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
        select: { faculty_id: true, name: true },
      });
      // Add constraints
      await prisma.facultyConstraint.create({
        data: {
          faculty_id: faculty.faculty_id,
          max_lectures_per_day: 5,
          total_lectures_per_week: 24,
          unavailable_slots: [],
          preferred_slots: [],
        },
      });
      console.log(`  Created faculty: ${f.name} (id=${faculty.faculty_id})`);
    } else {
      console.log(`  Faculty already exists: ${f.name} (id=${faculty.faculty_id})`);
    }
    map[f.code] = faculty.faculty_id;
  }
  return map;
}

async function upsertSubjects(facultyMap) {
  // Delete existing IT sem 4 subjects to avoid duplicates
  const deleted = await prisma.subject.deleteMany({
    where: { branch_id: BRANCH_ID, semester: SEMESTER },
  });
  console.log(`  Deleted ${deleted.count} existing IT Sem 4 subjects.`);

  for (const s of SUBJECTS) {
    const fId = facultyMap[s.faculty];
    const weeklyHours = s.isLab ? 2 : s.credits;
    await prisma.subject.create({
      data: {
        subject_code:    s.code,
        subject_name:    s.name,
        semester:        SEMESTER,
        branch_id:       BRANCH_ID,
        acad_year:       ACAD_YEAR,
        weekly_hours:    weeklyHours,
        semester_hours:  weeklyHours * 16,
        professor_assign: fId ? String(fId) : null,
        totalcredits:    s.credits,
        ispractical:     s.isLab ? 'Yes' : 'No',
        isoral:          'No',
        max_marks:       100,
        passing_marks:   40,
      },
    });
  }
  console.log(`  Seeded ${SUBJECTS.length} IT Sem 4 subjects.`);
}

async function clearExistingTimetable() {
  // Get all timetable row IDs for IT sem 4
  const ttRows = await prisma.tblTimeTable.findMany({
    where: { branch_id: BRANCH_ID, sem: String(SEMESTER) },
    select: { id: true },
  });
  const ttIds = ttRows.map(r => r.id);

  if (ttIds.length === 0) {
    console.log('  No existing IT Sem 4 timetable to clear.');
    return;
  }

  // Get time_time_detailed IDs
  const detailedRows = await prisma.timeTimeDetailed.findMany({
    where: { timetable_id: { in: ttIds } },
    select: { id: true },
  });
  const detailedIds = detailedRows.map(r => r.id);

  // Delete in order: batch_subjects → detailed → timetable
  await prisma.timeTableBatchSubject.deleteMany({
    where: { time_table_detailed_id: { in: detailedIds } },
  });
  await prisma.timeTimeDetailed.deleteMany({
    where: { timetable_id: { in: ttIds } },
  });
  await prisma.tblTimeTable.deleteMany({
    where: { id: { in: ttIds } },
  });

  console.log(`  Cleared ${ttRows.length} IT Sem 4 timetable day-rows.`);
}

async function insertDivisionTimetable(division, daySlots, facultyMap, adminUid) {
  let slotsCreated = 0;
  let lecturesCreated = 0;

  for (const day of DAYS) {
    const slots = daySlots[day];
    if (!slots || slots.length === 0) continue;

    // Create the timetable row for this day
    const ttRow = await prisma.tblTimeTable.create({
      data: {
        dateOfWeek: day,
        branch_id:  BRANCH_ID,
        sem:        String(SEMESTER),
        division,
        academic_id: null,
        createdBy:  BigInt(adminUid),
      },
      select: { id: true },
    });

    for (const slot of slots) {
      const [startHr, startMin] = slot.start;
      const [endHr, endMin]     = slot.end;

      // Create the time slot detail
      const detail = await prisma.timeTimeDetailed.create({
        data: {
          timetable_id:     ttRow.id,
          startTimeHr:      startHr,
          startTimeMinutes: startMin,
          endTimeHr:        endHr,
          endTimeMinutes:   endMin,
          createdBy:        BigInt(adminUid),
        },
        select: { id: true },
      });
      slotsCreated++;

      // Insert each lecture in this slot
      for (const lec of slot.lectures) {
        const facultyId = facultyMap[lec.faculty];
        if (!facultyId) {
          console.warn(`    ⚠ Unknown faculty code "${lec.faculty}" for ${lec.subjectCode} – skipping.`);
          continue;
        }

        await prisma.timeTableBatchSubject.create({
          data: {
            time_table_detailed_id: detail.id,
            typeOfLecture:          lec.type,
            subjectCode:            lec.subjectCode,
            facultyid:              BigInt(facultyId),
            batch:                  lec.batch || null,
            room_number:            lec.room,
            createdBy:              BigInt(adminUid),
          },
        });
        lecturesCreated++;
      }
    }
  }

  console.log(`  Div ${division}: ${slotsCreated} time slots, ${lecturesCreated} lecture records created.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  IT Dept — SE Sem IV Timetable Seed (Div A & Div B)');
  console.log('  VPPCOEVA Mumbai');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get admin user
  const admin = await prisma.user.findFirst({
    where: { user_type: 1 },
    orderBy: { uid: 'asc' },
    select: { uid: true, email: true },
  });
  if (!admin) throw new Error('No admin user found. Create admin first.');
  console.log(`Admin: ${admin.email} (uid=${admin.uid})\n`);

  console.log('── Step 1: Rooms ──');
  await upsertRooms();

  console.log('\n── Step 2: Faculty ──');
  const facultyMap = await upsertITFaculty();
  console.log('  Faculty code → ID map:', facultyMap);

  console.log('\n── Step 3: Subjects ──');
  await upsertSubjects(facultyMap);

  console.log('\n── Step 4: Clear old IT Sem 4 timetable ──');
  await clearExistingTimetable();

  console.log('\n── Step 5: Insert Div A timetable ──');
  await insertDivisionTimetable('A', DIV_A, facultyMap, admin.uid);

  console.log('\n── Step 6: Insert Div B timetable ──');
  await insertDivisionTimetable('B', DIV_B, facultyMap, admin.uid);

  // ── Summary ──
  const [ttCount, subCount, facCount] = await Promise.all([
    prisma.tblTimeTable.count({ where: { branch_id: BRANCH_ID, sem: String(SEMESTER) } }),
    prisma.subject.count({ where: { branch_id: BRANCH_ID, semester: SEMESTER } }),
    prisma.faculty.count({ where: { branch_id: BRANCH_ID } }),
  ]);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅  Seed complete!');
  console.log(`  Timetable day-rows (IT Sem 4): ${ttCount}`);
  console.log(`  IT Sem 4 subjects:             ${subCount}`);
  console.log(`  IT dept faculty:               ${facCount}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main()
  .catch(err => {
    console.error('\n❌ Seed failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
