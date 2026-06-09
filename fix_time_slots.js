const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('=== Fixing Time Slots to 1-hour blocks ===');

  // Delete all time-related data first (will be regenerated)
  await p.timeTableBatchSubject.deleteMany({});
  await p.timeTimeDetailed.deleteMany({});
  await p.tblTimeTable.deleteMany({});

  // Delete old time slot templates
  await p.timeSlotTemplate.deleteMany({});
  console.log('Deleted old time slots and timetable data.');

  // Insert new 1-hour-based slots following the real timetable pattern
  // 9:00-10:00, 10:00-11:00, [short break], 11:20-12:20, 12:20-1:20, [lunch], 2:00-3:00, 3:00-4:00, 4:00-5:00
  const newSlots = [
    { sort_order: 1, startTimeHr: 9, startTimeMinutes: 0, endTimeHr: 10, endTimeMinutes: 0, is_break: 0, is_active: 1, label: 'Period 1' },
    { sort_order: 2, startTimeHr: 10, startTimeMinutes: 0, endTimeHr: 11, endTimeMinutes: 0, is_break: 0, is_active: 1, label: 'Period 2' },
    { sort_order: 3, startTimeHr: 11, startTimeMinutes: 0, endTimeHr: 11, endTimeMinutes: 20, is_break: 1, is_active: 1, label: 'Short Break' },
    { sort_order: 4, startTimeHr: 11, startTimeMinutes: 20, endTimeHr: 12, endTimeMinutes: 20, is_break: 0, is_active: 1, label: 'Period 3' },
    { sort_order: 5, startTimeHr: 12, startTimeMinutes: 20, endTimeHr: 13, endTimeMinutes: 20, is_break: 0, is_active: 1, label: 'Period 4' },
    { sort_order: 6, startTimeHr: 13, startTimeMinutes: 20, endTimeHr: 14, endTimeMinutes: 0, is_break: 1, is_active: 1, label: 'Lunch Break' },
    { sort_order: 7, startTimeHr: 14, startTimeMinutes: 0, endTimeHr: 15, endTimeMinutes: 0, is_break: 0, is_active: 1, label: 'Period 5' },
    { sort_order: 8, startTimeHr: 15, startTimeMinutes: 0, endTimeHr: 16, endTimeMinutes: 0, is_break: 0, is_active: 1, label: 'Period 6' },
    { sort_order: 9, startTimeHr: 16, startTimeMinutes: 0, endTimeHr: 17, endTimeMinutes: 0, is_break: 0, is_active: 1, label: 'Period 7' },
  ];

  for (const slot of newSlots) {
    await p.timeSlotTemplate.create({ data: slot });
    console.log(`  Created: ${String(slot.startTimeHr).padStart(2,'0')}:${String(slot.startTimeMinutes).padStart(2,'0')} - ${String(slot.endTimeHr).padStart(2,'0')}:${String(slot.endTimeMinutes).padStart(2,'0')} ${slot.is_break ? '[BREAK]' : ''}`);
  }

  const nonBreak = newSlots.filter(s => !s.is_break);
  console.log(`\nDone! ${nonBreak.length} non-break slots (7 one-hour periods)`);
  console.log('Slot indices (0-based): ' + newSlots.map((s, i) => i + ': ' + (s.is_break ? 'BREAK' : 'PERIOD')).join(', '));

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });