'use strict';
const { generateSchedule, generateAllSchedules } = require('./src/services/timetable.service');
const prisma = require('./src/config/prisma');

async function main() {
  console.log('=== Testing Multi-Division Timetable Generation ===\n');

  try {
    // Generate for Sem 4 & 6 Divisions simultaneously
    const result = await generateAllSchedules({
      academicYear: '2025-26',
      createdBy: 1,
      branchIds: [1],
      semesters: [4, 6],
      divisions: ['A', 'B'],
    });

    console.log('Generation result:', JSON.stringify(result, null, 2));

    // Get unique sem/div pairs from the DB to display
    const uniqueClasses = await prisma.tblTimeTable.findMany({
      where: { branch_id: 1 },
      distinct: ['sem', 'division'],
      select: { sem: true, division: true },
      orderBy: [{ sem: 'asc' }, { division: 'asc' }],
    });

    for (const cls of uniqueClasses) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`  SEM ${cls.sem} - DIV ${cls.division}`);
      console.log(`${'='.repeat(60)}`);

      const timetables = await prisma.tblTimeTable.findMany({
        where: { branch_id: 1, sem: cls.sem, division: cls.division },
        include: {
          time_details: {
            include: { batch_subjects: true },
            orderBy: [{ startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
          },
        },
      });

      // Sort by day order
      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      timetables.sort((a, b) => dayOrder.indexOf(a.dateOfWeek) - dayOrder.indexOf(b.dateOfWeek));

      // Get faculty names
      const allFaculty = await prisma.faculty.findMany();
      const facultyMap = {};
      for (const f of allFaculty) facultyMap[f.faculty_id] = f.name;

      for (const tt of timetables) {
        console.log(`\n--- ${tt.dateOfWeek} ---`);
        for (const slot of tt.time_details) {
          const subjects = slot.batch_subjects || [];
          const timeStr = `${String(slot.startTimeHr).padStart(2, '0')}:${String(slot.startTimeMinutes).padStart(2, '0')}-${String(slot.endTimeHr).padStart(2, '0')}:${String(slot.endTimeMinutes).padStart(2, '0')}`;

          if (subjects.length === 0) {
            // Check if it's a break
            if ((slot.startTimeHr === 11 && slot.startTimeMinutes === 0) ||
                (slot.startTimeHr === 13 && slot.startTimeMinutes === 20)) {
              console.log(`  ${timeStr} [BREAK]`);
            } else {
              console.log(`  ${timeStr} [EMPTY]`);
            }
          } else if (subjects.length === 1) {
            const s = subjects[0];
            const fname = s.facultyid ? (facultyMap[Number(s.facultyid)] || '?') : '?';
            console.log(`  ${timeStr} ${s.subjectCode} (${fname}) Room ${s.room_number || '?'}`);
          } else {
            // Multiple subjects = batch-split
            console.log(`  ${timeStr}`);
            for (const s of subjects) {
              const fname = s.facultyid ? (facultyMap[Number(s.facultyid)] || '?') : '?';
              console.log(`    ${s.batch}: ${s.subjectCode} (${fname}) Room ${s.room_number || '?'}`);
            }
          }
        }
      }
    }

    // Check for cross-division faculty conflicts
    console.log(`\n${'='.repeat(60)}`);
    console.log('  CONFLICT CHECK');
    console.log(`${'='.repeat(60)}`);

    const allTT = await prisma.tblTimeTable.findMany({
      where: { branch_id: 1, sem: '4' },
      include: {
        time_details: {
          include: { batch_subjects: true },
        },
      },
    });

    const slotMap = {}; // `${day}_${startHr}:${startMin}_${facultyId}` → [div]
    let conflicts = 0;
    for (const tt of allTT) {
      for (const slot of tt.time_details) {
        for (const s of slot.batch_subjects) {
          if (!s.facultyid) continue;
          const key = `${tt.dateOfWeek}_${slot.startTimeHr}:${slot.startTimeMinutes}_${Number(s.facultyid)}`;
          if (!slotMap[key]) slotMap[key] = [];
          slotMap[key].push(tt.division);
        }
      }
    }

    for (const [key, divs] of Object.entries(slotMap)) {
      const uniqueDivs = [...new Set(divs)];
      if (uniqueDivs.length > 1) {
        console.log(`  ⚠️ FACULTY CONFLICT: ${key} appears in divisions ${uniqueDivs.join(', ')}`);
        conflicts++;
      }
    }

    if (conflicts === 0) {
      console.log('  ✅ No cross-division faculty conflicts found!');
    } else {
      console.log(`  ❌ Found ${conflicts} cross-division faculty conflicts`);
    }

  } catch (err) {
    console.error('Generation failed:', err.message);
    console.error(err.stack);
  }

  await prisma.$disconnect();
}

main();