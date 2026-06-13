const { generateAllSchedules } = require('../src/services/timetable.service');

async function main() {
  const result = await generateAllSchedules({
    academicYear: '2025-26',
    createdBy: 1,
    branchIds: [1, 2],
    semesters: [4, 6],
    divisions: ['A', 'B'],
    enforceLabRooms: true,
    fillCompact: true,
    optimizerRuns: 5
  });
  console.log('Skipped Classes Count:', result.skippedClassCount);
  console.log('Skipped Classes:', JSON.stringify(result.skippedClasses, null, 2));
  console.log('Skipped Subjects Count:', result.skippedSubjectsCount);
  console.log('Skipped Subjects:', JSON.stringify(result.skippedSubjects, null, 2));
}

main().catch(console.error);
