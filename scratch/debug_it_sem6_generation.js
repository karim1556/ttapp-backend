const { generateAllSchedules } = require('../src/services/timetable.service');
const prisma = require('../src/config/prisma');

async function main() {
  console.log('=== DEBUG GENERATION ===');
  try {
    const result = await generateAllSchedules({
      academicYear: '2025-26',
      createdBy: 1,
      branchIds: [2],
      semesters: [6],
      divisions: ['B'],
      enforceLabRooms: true,
      fillCompact: true,
      optimizerRuns: 1
    });
    console.log('Result:', JSON.stringify(result.optimization, null, 2));
    console.log('Skipped subjects:', result.skippedSubjects);
  } catch (e) {
    console.error('Error:', e);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
