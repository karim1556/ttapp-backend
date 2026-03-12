'use strict';
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Delete all existing (corrupt) time slot templates
  const del = await p.timeSlotTemplate.deleteMany({});
  console.log('Cleared time_slot_templates, removed:', del.count);

  // Delete the corrupt Div A timetable rows (cascade removes time_time_detailed + batch_subjects)
  const delA = await p.tblTimeTable.deleteMany({ where: { division: 'A' } });
  console.log('Deleted corrupt Div A timetable rows:', delA.count);

  // Seed the correct 8 periods + 1 lunch break
  const defaults = [
    { label: 'Period 1',    startTimeHr: 8,  startTimeMinutes: 0, endTimeHr: 9,  endTimeMinutes: 0, is_break: 0, sort_order: 1, is_active: 1 },
    { label: 'Period 2',    startTimeHr: 9,  startTimeMinutes: 0, endTimeHr: 10, endTimeMinutes: 0, is_break: 0, sort_order: 2, is_active: 1 },
    { label: 'Period 3',    startTimeHr: 10, startTimeMinutes: 0, endTimeHr: 11, endTimeMinutes: 0, is_break: 0, sort_order: 3, is_active: 1 },
    { label: 'Period 4',    startTimeHr: 11, startTimeMinutes: 0, endTimeHr: 12, endTimeMinutes: 0, is_break: 0, sort_order: 4, is_active: 1 },
    { label: 'Lunch Break', startTimeHr: 12, startTimeMinutes: 0, endTimeHr: 13, endTimeMinutes: 0, is_break: 1, sort_order: 5, is_active: 1 },
    { label: 'Period 5',    startTimeHr: 13, startTimeMinutes: 0, endTimeHr: 14, endTimeMinutes: 0, is_break: 0, sort_order: 6, is_active: 1 },
    { label: 'Period 6',    startTimeHr: 14, startTimeMinutes: 0, endTimeHr: 15, endTimeMinutes: 0, is_break: 0, sort_order: 7, is_active: 1 },
    { label: 'Period 7',    startTimeHr: 15, startTimeMinutes: 0, endTimeHr: 16, endTimeMinutes: 0, is_break: 0, sort_order: 8, is_active: 1 },
    { label: 'Period 8',    startTimeHr: 16, startTimeMinutes: 0, endTimeHr: 17, endTimeMinutes: 0, is_break: 0, sort_order: 9, is_active: 1 },
  ];
  await p.timeSlotTemplate.createMany({ data: defaults });
  console.log('Seeded', defaults.length, 'time slot templates');

  const verify = await p.timeSlotTemplate.findMany({ orderBy: { sort_order: 'asc' } });
  verify.forEach(s =>
    console.log(' ', s.sort_order, s.label,
      String(s.startTimeHr).padStart(2,'0') + ':' + String(s.startTimeMinutes).padStart(2,'0'),
      '–',
      String(s.endTimeHr).padStart(2,'0') + ':' + String(s.endTimeMinutes).padStart(2,'0'),
      s.is_break ? '[BREAK]' : '')
  );

  console.log('\nDone. Now regenerate Division A from the admin panel.');
}

main().finally(() => p.$disconnect());
