const prisma = require('./src/config/prisma');

async function main() {
  const tt = await prisma.tblTimeTable.findMany({
    where: { branch_id: 1, sem: '4', division: 'A' },
    select: { id: true, dateOfWeek: true }
  });

  if (!tt.length) {
    console.log('No timetable found');
    return;
  }

  const ttIds = tt.map(t => t.id);

  const details = await prisma.timeTimeDetailed.findMany({
    where: { timetable_id: { in: ttIds } },
    select: { id: true, startTimeHr: true, startTimeMinutes: true, endTimeHr: true, endTimeMinutes: true, timetable_id: true }
  });

  const detailIds = details.map(d => d.id);

  const batches = await prisma.timeTableBatchSubject.findMany({
    where: { time_table_detailed_id: { in: detailIds } },
    select: { subjectCode: true, typeOfLecture: true, batch: true, room_number: true, time_table_detailed_id: true }
  });

  // Map detail to day+time
  const detailToInfo = {};
  for (const d of details) {
    const ttRow = tt.find(t => t.id === d.timetable_id);
    if (ttRow) {
      detailToInfo[d.id] = {
        day: ttRow.dateOfWeek,
        startHr: d.startTimeHr,
        startMin: d.startTimeMinutes,
        endHr: d.endTimeHr,
        endMin: d.endTimeMinutes
      };
    }
  }

  // Show full table
  console.log('=== FULL TIMETABLE ===');
  for (const ttRow of tt) {
    console.log('\n--- ' + ttRow.dateOfWeek + ' ---');
    const dayDetails = details.filter(d => d.timetable_id === ttRow.id);
    for (const d of dayDetails) {
      const subjEntries = batches.filter(b => b.time_table_detailed_id === d.id);
      if (subjEntries.length === 0) {
        console.log('  ' + d.startTimeHr + ':' + String(d.startTimeMinutes).padStart(2,'0') + '-' + d.endTimeHr + ':' + String(d.endTimeMinutes).padStart(2,'0') + ' [EMPTY]');
      } else {
        for (const s of subjEntries) {
          console.log('  ' + d.startTimeHr + ':' + String(d.startTimeMinutes).padStart(2,'0') + '-' + d.endTimeHr + ':' + String(d.endTimeMinutes).padStart(2,'0') + ' ' + s.subjectCode + ' [' + s.typeOfLecture + '] batch=' + s.batch + ' room=' + s.room_number);
        }
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());