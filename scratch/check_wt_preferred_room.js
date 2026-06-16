'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const subjects = await prisma.subject.findMany({
    where: {
      subject_code: {
        contains: 'WT',
      },
    },
  });

  console.log('=== SUBJECT CONFIGURATIONS ===');
  subjects.forEach((s) => {
    console.log(`Code: ${s.subject_code}
      Name: ${s.subject_name}
      Branch: ${s.branch_id}
      Sem: ${s.semester}
      Preferred Room: ${s.preferred_room}
      Professor Assign: ${s.professor_assign}
    `);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
