'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const timetables = await prisma.tblTimeTable.findMany({
    where: {
      branch_id: 2,
      sem: '6',
      dateOfWeek: 'Monday',
    },
    include: {
      time_details: {
        include: {
          batch_subjects: true,
        },
      },
    },
  });

  console.log('=== MONDAY TIMETABLES FOR IT SEM 6 ===');
  timetables.forEach((t) => {
    console.log(`\nTimetable ID: ${t.id} - Div: ${t.division}`);
    t.time_details.forEach((slot) => {
      console.log(`  Slot ID: ${slot.id} (${slot.startTimeHr}:${slot.startTimeMinutes} - ${slot.endTimeHr}:${slot.endTimeMinutes})`);
      slot.batch_subjects.forEach((l) => {
        console.log(`    Lecture ID: ${l.id} | Subject: ${l.subjectCode} | Room: ${l.room_number} | Faculty: ${l.facultyid} | Type: ${l.typeOfLecture}`);
      });
    });
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
