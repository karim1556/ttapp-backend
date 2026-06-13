const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.classLabSlot.findMany();
  console.log('=== ClassLabSlot Configurations ===');
  for (const c of configs) {
    console.log(`BranchId: ${c.branch_id}, Semester: ${c.semester}, Division: ${c.division}, batch_split_slot_index: ${c.batch_split_slot_index}, batch_split_enabled: ${c.batch_split_enabled}, lab_slot_index: ${c.lab_slot_index}, lab_duration_slots: ${c.lab_duration_slots}, home_room: ${c.home_room}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
