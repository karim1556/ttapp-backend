'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.timeSlotTemplate.findMany();
  console.log('=== TIME SLOT TEMPLATES IN DB ===');
  templates.forEach(t => {
    console.log(`ID: ${t.id}, label: ${t.label}, branch_id: ${t.branch_id}, semester: ${t.semester}, is_active: ${t.is_active} (${typeof t.is_active})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
