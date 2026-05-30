'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ACADEMIC_YEAR = '2026-27';
const HOLIDAYS_2026 = [
  { date: '2026-01-26', name: 'Republic Day', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-03-04', name: 'Holi', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-03-21', name: 'Ramzan Id', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-03-26', name: 'Rama Navami', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-03-31', name: 'Mahavir Jayanti', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-04-03', name: 'Good Friday', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-05-01', name: 'Buddha Purnima', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-05-27', name: 'Bakrid (Tentative Date)', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-06-26', name: 'Muharram/Ashura (Tentative Date)', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-08-15', name: 'Independence Day', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-08-26', name: 'Milad un-Nabi (Tentative Date)', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-09-04', name: 'Janmashtami', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-10-20', name: 'Dussehra', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-11-08', name: 'Diwali/Deepavali', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti', type: 'PUBLIC_HOLIDAY' },
  { date: '2026-12-25', name: 'Christmas', type: 'PUBLIC_HOLIDAY' },
];

async function main() {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const end = new Date('2027-01-01T00:00:00.000Z');

  const deleted = await prisma.holiday.deleteMany({
    where: { date: { gte: start, lt: end } },
  });
  console.log(`Removed ${deleted.count} existing 2026 holidays.`);

  const data = HOLIDAYS_2026.map((h) => ({
    date: new Date(h.date),
    name: h.name,
    type: h.type,
    description: 'India (IN)',
    academic_year: ACADEMIC_YEAR,
  }));

  await prisma.holiday.createMany({ data });
  console.log(`Seeded ${data.length} holidays for ${ACADEMIC_YEAR}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
