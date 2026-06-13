'use strict';
const prisma = require('../src/config/prisma');

function branchLabel(branchId) {
  switch (branchId) {
    case 1: return 'CS';
    case 2: return 'IT';
    default: return `Branch ${branchId}`;
  }
}

async function main() {
  const timetables = await prisma.tblTimeTable.findMany({
    where: { branch_id: { in: [1, 2] }, sem: { in: ['4', '6'] }, division: { in: ['A', 'B'] } },
    include: {
      time_details: {
        include: { batch_subjects: true },
        orderBy: [{ startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
      },
    },
  });

  function isSlotBreak(s) {
    return (s.startTimeHr === 11 && s.startTimeMinutes === 0) || (s.startTimeHr === 13 && s.startTimeMinutes === 20);
  }

  function countGapsOnDay(timeDetails) {
    const localNonBreak = [];
    for (let i = 0; i < timeDetails.length; i++) {
      if (!isSlotBreak(timeDetails[i])) {
        localNonBreak.push(i);
      }
    }

    let lastFilled = -1;
    for (let i = 0; i < localNonBreak.length; i++) {
      const idx = localNonBreak[i];
      const hasLecture = timeDetails[idx] && timeDetails[idx].batch_subjects && timeDetails[idx].batch_subjects.length > 0;
      if (hasLecture) {
        lastFilled = i;
      }
    }
    if (lastFilled === -1) return 0;
    
    let gaps = 0;
    for (let i = 0; i <= lastFilled; i++) {
      const idx = localNonBreak[i];
      const hasLecture = timeDetails[idx] && timeDetails[idx].batch_subjects && timeDetails[idx].batch_subjects.length > 0;
      if (!hasLecture) {
        gaps++;
      }
    }
    return gaps;
  }

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const grouped = {};
  for (const ttRow of timetables) {
    const key = `${branchLabel(ttRow.branch_id)} Sem ${ttRow.sem} - Div ${ttRow.division}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ttRow);
  }

  console.log('\n=== CURRENT DB TIMETABLE SCORE REPORT ===');
  let totalGapsAcrossClasses = 0;
  let totalUnderloads = 0;
  let totalOverloads = 0;

  for (const [classKey, ttRows] of Object.entries(grouped)) {
    console.log(`\n${classKey}:`);
    ttRows.sort((a, b) => dayOrder.indexOf(a.dateOfWeek) - dayOrder.indexOf(b.dateOfWeek));
    for (const ttRow of ttRows) {
      const localNonBreak = [];
      for (let i = 0; i < ttRow.time_details.length; i++) {
        if (!isSlotBreak(ttRow.time_details[i])) localNonBreak.push(i);
      }
      const hours = localNonBreak.filter(idx => ttRow.time_details[idx] && ttRow.time_details[idx].batch_subjects && ttRow.time_details[idx].batch_subjects.length > 0).length;
      const gaps = countGapsOnDay(ttRow.time_details);
      
      let loadStatus = 'Normal';
      if (hours > 0) {
        if (hours < 3) {
          loadStatus = `Underload (${hours}h) ⚠️`;
          totalUnderloads++;
        } else if (hours > 5) {
          loadStatus = `Overload (${hours}h) ⚠️`;
          totalOverloads++;
        } else {
          loadStatus = `Good (${hours}h)`;
        }
      } else {
        loadStatus = 'Free Day';
      }

      if (gaps > 0) {
        console.log(`  - ${ttRow.dateOfWeek}: load=${loadStatus}, gaps=${gaps} ❌`);
        totalGapsAcrossClasses += gaps;
      } else {
        console.log(`  - ${ttRow.dateOfWeek}: load=${loadStatus}, gaps=0`);
      }
    }
  }

  console.log('\n=== METRIC SUMMARY ===');
  console.log(`Total Gaps found: ${totalGapsAcrossClasses}`);
  console.log(`Total Underloaded days: ${totalUnderloads}`);
  console.log(`Total Overloaded days: ${totalOverloads}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
