'use strict';
const prisma = require('./src/config/prisma');

async function main() {
  const facultyList = [
    { name: 'Prof. Priya Mane', code: 'OS', id: null },
    { name: 'Prof. Sandip Patil', code: 'CNND', id: null },
    { name: 'Prof. Tejaswini Naik', code: 'AMT-II', id: null },
    { name: 'Prof. Nitin Ingale', code: 'MDM', id: null },
    { name: 'Prof. Atul Tarwade', code: 'OE', id: null },
    { name: 'Dr. Vinod Sakpal', code: 'DT', id: null },
    { name: 'Prof. Nilesh Wadekar', code: 'BMD', id: null },
    { name: 'Prof. Ankur Chavan', code: 'MPP', id: null }
  ];

  // Resolve faculty IDs
  const dbFaculty = await prisma.faculty.findMany();
  for (const f of facultyList) {
    const matched = dbFaculty.find(df => df.name.toLowerCase().trim() === f.name.toLowerCase().trim());
    if (matched) f.id = matched.faculty_id;
  }

  const facultyIds = facultyList.map(f => f.id).filter(Boolean);

  // Find all scheduled lectures for these faculty on Tuesday during slots 3 and 4 (11:20-12:20 and 12:20-13:20)
  const slots = await prisma.timeTimeDetailed.findMany({
    where: {
      OR: [
        { startTimeHr: 11, startTimeMinutes: 20 },
        { startTimeHr: 12, startTimeMinutes: 20 }
      ],
      timetable: {
        dateOfWeek: 'Tuesday'
      }
    },
    include: {
      timetable: true,
      batch_subjects: true
    }
  });

  console.log('=== FACULTY SCHEDULE FOR TUESDAY PERIOD 3 & 4 ===\n');

  for (const f of facultyList) {
    if (!f.id) {
      console.log(`Faculty not found: ${f.name}`);
      continue;
    }

    console.log(`--- ${f.name} (${f.code}) ---`);
    let busyCount = 0;

    for (const slot of slots) {
      const isAssigned = slot.batch_subjects.some(bs => Number(bs.facultyid) === f.id);
      if (isAssigned) {
        const timeStr = `${String(slot.startTimeHr).padStart(2,'0')}:${String(slot.startTimeMinutes).padStart(2,'0')}-${String(slot.endTimeHr).padStart(2,'0')}:${String(slot.endTimeMinutes).padStart(2,'0')}`;
        const detail = slot.batch_subjects.find(bs => Number(bs.facultyid) === f.id);
        const branchLabel = slot.timetable.branch_id === 1 ? 'CS' : 'IT';
        console.log(`  Busy at ${timeStr} teaching ${detail.subjectCode} to ${branchLabel} Sem ${slot.timetable.sem} Div ${slot.timetable.division} in Room ${detail.room_number}`);
        busyCount++;
      }
    }

    if (busyCount === 0) {
      console.log('  Free during both periods! ✅');
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
