'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const lectures = await prisma.timeTableBatchSubject.findMany({
    where: {
      room_number: '212',
      time_slot: {
        is: {
          timetable: {
            is: {
              dateOfWeek: 'Monday',
            },
          },
        },
      },
    },
    include: {
      time_slot: {
        include: {
          timetable: true,
        },
      },
    },
  });

  console.log('=== LECTURES IN ROOM 212 ON MONDAY ===');
  lectures.forEach((l) => {
    console.log(`ID: ${l.id}
      Subject: ${l.subjectCode}
      Class: Branch ${l.time_slot.timetable.branch_id} Sem ${l.time_slot.timetable.sem} Div ${l.time_slot.timetable.division}
      Time: ${l.time_slot.startTimeHr}:${l.time_slot.startTimeMinutes} to ${l.time_slot.endTimeHr}:${l.time_slot.endTimeMinutes}
      Faculty: ${l.facultyid}
    `);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
