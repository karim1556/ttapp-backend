'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.classLabSlot.findMany();
  console.log('=== CLASS CONFIGURATIONS ===');
  configs.forEach(c => {
    console.log(`Branch ${c.branch_id} Sem ${c.semester} Div ${c.division}:
      batch_split_slot_index: ${c.batch_split_slot_index} (Rotated labs)
      lab_slot_index: ${c.lab_slot_index} (Project labs)
      batch_split_enabled: ${c.batch_split_enabled}
      lab_duration_slots: ${c.lab_duration_slots}
      home_room: ${c.home_room}
      academic_year: ${c.academic_year}`);
  });

  const rooms = await prisma.room.findMany();
  console.log('\n=== ROOMS IN DATABASE ===');
  rooms.forEach(r => {
    console.log(`Room ${r.room_number}: type=${r.room_type}, branch_id=${r.branch_id}, active=${r.is_active}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
