'use strict';
const prisma = require('./src/config/prisma');

async function main() {
  const constraints = await prisma.facultyConstraint.findMany({
    include: { faculty: true }
  });

  console.log('=== FACULTY CONSTRAINTS ===\n');
  for (const c of constraints) {
    console.log(`Faculty: ${c.faculty.name} (ID: ${c.faculty_id})`);
    console.log(`  Max lectures per day: ${c.max_lectures_per_day}`);
    console.log(`  Total lectures per week: ${c.total_lectures_per_week}`);
    console.log(`  Unavailable slots: ${c.unavailable_slots ? JSON.stringify(c.unavailable_slots) : 'None'}`);
    console.log(`  Preferred slots: ${c.preferred_slots ? JSON.stringify(c.preferred_slots) : 'None'}`);
    console.log();
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
