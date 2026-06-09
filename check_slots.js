const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const slots = await p.timeSlotTemplate.findMany({ orderBy: { sort_order: 'asc' } });
  console.log('=== TIME SLOTS IN DB ===');
  slots.forEach(s => {
    const startHr = String(s.startTimeHr).padStart(2, '0');
    const startMin = String(s.startTimeMinutes).padStart(2, '0');
    const endHr = String(s.endTimeHr).padStart(2, '0');
    const endMin = String(s.endTimeMinutes).padStart(2, '0');
    console.log('[' + s.sort_order + '] ' + startHr + ':' + startMin + ' - ' + endHr + ':' + endMin + ' break=' + s.is_break + ' label=' + (s.label || ''));
  });
  const nonBreak = slots.filter(x => x.is_break == 0 || x.is_break === false);
  console.log('Non-break count:', nonBreak.length);
  console.log('Total slots:', slots.length);
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });