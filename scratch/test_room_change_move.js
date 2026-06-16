'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const lectureId = 10424; // WT Lecture ID
  const targetSlotId = 11454; // Monday 14:00 - 15:00 Slot ID for Division B

  const targetSlot = await prisma.timeTimeDetailed.findUnique({
    where: { id: targetSlotId },
    include: { timetable: true },
  });

  console.log(`Target Slot: ${targetSlot.timetable.dateOfWeek} ${targetSlot.startTimeHr}:${targetSlot.startTimeMinutes}`);

  // Check room conflict with Room 213 at Monday 14:00
  const conflictRoom213 = await prisma.timeTableBatchSubject.findFirst({
    where: {
      room_number: '213',
      time_slot: {
        is: {
          startTimeHr: targetSlot.startTimeHr,
          startTimeMinutes: targetSlot.startTimeMinutes,
          timetable: {
            is: {
              dateOfWeek: targetSlot.timetable.dateOfWeek,
            },
          },
        },
      },
    },
  });

  console.log('Is Room 213 occupied at Monday 14:00?', conflictRoom213 ? 'Yes' : 'No');

  // Check room conflict with Room 212 at Monday 14:00
  const conflictRoom212 = await prisma.timeTableBatchSubject.findFirst({
    where: {
      room_number: '212',
      time_slot: {
        is: {
          startTimeHr: targetSlot.startTimeHr,
          startTimeMinutes: targetSlot.startTimeMinutes,
          timetable: {
            is: {
              dateOfWeek: targetSlot.timetable.dateOfWeek,
            },
          },
        },
      },
    },
  });

  console.log('Is Room 212 occupied at Monday 14:00?', conflictRoom212 ? 'Yes' : 'No');
}

main().catch(console.error).finally(() => prisma.$disconnect());
