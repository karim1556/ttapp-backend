'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== UPDATING ROOM TYPES AND BRANCHES IN DB ===');

  // CS Labs & Batch Split Rooms
  const csLabs = ['301', '302', '303', '305', '306', '307'];
  for (const roomNum of csLabs) {
    const updated = await prisma.room.updateMany({
      where: { room_number: roomNum },
      data: { room_type: 'Lab', branch_id: 1 }
    });
    console.log(`Updated room ${roomNum} to Lab (CS): count=${updated.count}`);
  }

  // CS Classrooms
  const csClassrooms = ['311', '312', '308'];
  for (const roomNum of csClassrooms) {
    const updated = await prisma.room.updateMany({
      where: { room_number: roomNum },
      data: { room_type: 'Classroom', branch_id: 1 }
    });
    console.log(`Updated room ${roomNum} to Classroom (CS): count=${updated.count}`);
  }

  // IT Labs
  const itLabs = ['101', '102', '103', '105', '107', '112'];
  for (const roomNum of itLabs) {
    const updated = await prisma.room.updateMany({
      where: { room_number: roomNum },
      data: { room_type: 'Lab', branch_id: 2 }
    });
    console.log(`Updated room ${roomNum} to Lab (IT): count=${updated.count}`);
  }

  // IT Classrooms
  const itClassrooms = ['212', '213', '214'];
  for (const roomNum of itClassrooms) {
    const updated = await prisma.room.updateMany({
      where: { room_number: roomNum },
      data: { room_type: 'Classroom', branch_id: 2 }
    });
    console.log(`Updated room ${roomNum} to Classroom (IT): count=${updated.count}`);
  }

  console.log('=== ROOMS UPDATE COMPLETE ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
