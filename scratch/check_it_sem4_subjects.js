const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const subjects = await prisma.subject.findMany({
    where: { branch_id: 2, semester: 4 },
  });
  console.log('=== IT SEM 4 SUBJECTS ===');
  for (const s of subjects) {
    console.log(`Code: ${s.subject_code}, Name: ${s.subject_name}, Division: ${s.division || 'All'}, IsPractical: ${s.ispractical}, Batch: ${s.batch || 'None'}, WeeklyHours: ${s.weekly_hours}, SemHours: ${s.semester_hours}, Credits: ${s.totalcredits}, Professor: ${s.professor_assign}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
