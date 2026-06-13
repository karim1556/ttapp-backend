const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function branchLabel(branchId) {
  return branchId === 1 ? 'CS' : 'IT';
}

async function main() {
  const timetables = await prisma.tblTimeTable.findMany({
    where: { sem: '6' },
    include: {
      time_details: {
        include: { batch_subjects: true },
        orderBy: [{ startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
      },
    },
  });

  console.log('=== SEMESTER 6 GAPS ANALYSIS ===');

  for (const branchId of [1, 2]) {
    for (const division of ['A', 'B']) {
      const classTitle = `${branchLabel(branchId)} Sem 6 - Div ${division}`;
      console.log(`\n--- ${classTitle} ---`);

      const classTTs = timetables.filter(t => t.branch_id === branchId && t.division === division);

      for (const day of DAYS) {
        const tt = classTTs.find(t => t.dateOfWeek === day);
        if (!tt) {
          console.log(`  ${day}: No timetable found`);
          continue;
        }

        const slots = tt.time_details;
        const nonBreakSlots = slots.filter(s => {
          const isBreak = (s.startTimeHr === 11 && s.startTimeMinutes === 0) || 
                          (s.startTimeHr === 13 && s.startTimeMinutes === 20);
          return !isBreak;
        });

        // Find last filled slot index
        let lastFilled = -1;
        for (let i = 0; i < nonBreakSlots.length; i++) {
          if (nonBreakSlots[i].batch_subjects.length > 0) {
            lastFilled = i;
          }
        }

        if (lastFilled === -1) {
          console.log(`  ${day}: Completely Free (0 gaps)`);
          continue;
        }

        // Count gaps
        let gaps = [];
        let startsAtNine = nonBreakSlots[0].batch_subjects.length > 0;
        
        for (let i = 0; i <= lastFilled; i++) {
          if (nonBreakSlots[i].batch_subjects.length === 0) {
            const timeStr = `${String(nonBreakSlots[i].startTimeHr).padStart(2,'0')}:${String(nonBreakSlots[i].startTimeMinutes).padStart(2,'0')} - ${String(nonBreakSlots[i].endTimeHr).padStart(2,'0')}:${String(nonBreakSlots[i].endTimeMinutes).padStart(2,'0')}`;
            gaps.push(timeStr);
          }
        }

        console.log(`  ${day}: ${gaps.length} gaps. Starts at 9 AM: ${startsAtNine ? 'Yes' : 'NO'}`);
        if (gaps.length > 0) {
          console.log(`    Gaps at: ${gaps.join(', ')}`);
        }
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
