'use strict';
const prisma = require('./src/config/prisma');
const { generateAllSchedules } = require('./src/services/timetable.service');

function branchLabel(branchId) {
  switch (branchId) {
    case 1: return 'CS';
    case 2: return 'IT';
    case 3: return 'EXTC';
    case 4: return 'Mech';
    default: return `Branch ${branchId}`;
  }
}

async function main() {
  console.log('=== Regenerating Timetables starting from 9 AM ===');
  
  try {
    const result = await generateAllSchedules({
      academicYear: '2025-26',
      createdBy: 1,
      branchIds: [2],
      semesters: [4, 6],
      divisions: ['A', 'B'],
      enforceLabRooms: true,
      fillCompact: true,
      optimizerRuns: 150
    });

    console.log('\nGeneration complete! Status:', result.optimization);

    // Fetch all generated timetables
    const timetables = await prisma.tblTimeTable.findMany({
      where: {
        branch_id: 2,
        sem: { in: ['4', '6'] },
        division: { in: ['A', 'B'] }
      },
      include: {
        time_details: {
          include: { batch_subjects: true },
          orderBy: [{ startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
        },
      },
    });

    // Get faculty names
    const allFaculty = await prisma.faculty.findMany();
    const facultyMap = {};
    for (const f of allFaculty) facultyMap[f.faculty_id] = f.name;

    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    timetables.sort((a, b) => {
      if (a.branch_id !== b.branch_id) return a.branch_id - b.branch_id;
      if (a.sem !== b.sem) return parseInt(a.sem) - parseInt(b.sem);
      return a.division.localeCompare(b.division);
    });

    // Group by class key
    const classes = {};
    for (const ttRow of timetables) {
      const classKey = `${branchLabel(ttRow.branch_id)} Sem ${ttRow.sem} - Div ${ttRow.division}`;
      if (!classes[classKey]) classes[classKey] = [];
      classes[classKey].push(ttRow);
    }

    for (const [classTitle, ttRows] of Object.entries(classes)) {
      console.log(`\n============================================================`);
      console.log(`  WEEKLY TIMETABLE FOR ${classTitle.toUpperCase()}`);
      console.log(`============================================================`);

      ttRows.sort((a, b) => dayOrder.indexOf(a.dateOfWeek) - dayOrder.indexOf(b.dateOfWeek));

      for (const ttRow of ttRows) {
        console.log(`\n### ${ttRow.dateOfWeek.toUpperCase()}`);
        for (const slot of ttRow.time_details) {
          const timeStr = `${String(slot.startTimeHr).padStart(2, '0')}:${String(slot.startTimeMinutes).padStart(2, '0')} - ${String(slot.endTimeHr).padStart(2, '0')}:${String(slot.endTimeMinutes).padStart(2, '0')}`;
          
          const isBreak = (slot.startTimeHr === 11 && slot.startTimeMinutes === 0) || 
                          (slot.startTimeHr === 13 && slot.startTimeMinutes === 20);
          
          if (slot.batch_subjects.length === 0) {
            if (isBreak) {
              console.log(`| ${timeStr} | **[BREAK]** |`);
            } else {
              console.log(`| ${timeStr} | *[Free Period]* |`);
            }
          } else if (slot.batch_subjects.length === 1) {
            const s = slot.batch_subjects[0];
            const fname = s.facultyid ? (facultyMap[Number(s.facultyid)] || 'Unknown') : 'Unknown';
            console.log(`| ${timeStr} | Lecture: **${s.subjectCode}** (${fname}) - Room ${s.room_number || 'TBD'} |`);
          } else {
            const batchInfo = slot.batch_subjects.map(s => {
              const fname = s.facultyid ? (facultyMap[Number(s.facultyid)] || 'Unknown') : 'Unknown';
              return `Batch ${s.batch}: **${s.subjectCode}** (${fname}) in ${s.room_number || 'TBD'}`;
            }).join(' | ');
            console.log(`| ${timeStr} | Lab / Batch Split: ${batchInfo} |`);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error generating timetables:', err);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
