const prisma = require('../src/config/prisma');
const tempService = require('../src/services/temporary.service');

async function testBulk() {
  console.log('=== Testing createBulk controller logic ===');

  const payloadSingle = {
    branchId: 1,
    sem: 4,
    division: 'A',
    date: '2026-06-15',
    eventName: 'Guest Lecture Series',
    slots: [
      {
        startTimeHr: 9,
        startTimeMinutes: 0,
        endTimeHr: 10,
        endTimeMinutes: 0,
        subjectCode: 'DBMS',
        facultyId: 40
      },
      {
        startTimeHr: 10,
        startTimeMinutes: 0,
        endTimeHr: 11,
        endTimeMinutes: 0,
        subjectCode: 'CT',
        facultyId: 41
      }
    ]
  };

  const parsedDate = tempService.normalizeDate(payloadSingle.date);
  console.log(`Normalized Date: ${parsedDate.toISOString()}`);

  // Simulate createBulk for single date
  await prisma.temporaryTimeTable.deleteMany({
    where: {
      branch_id: payloadSingle.branchId,
      semester: payloadSingle.sem,
      division: payloadSingle.division,
      date: parsedDate,
    }
  });
  console.log('Cleared existing slots for 2026-06-15');

  const createdSingle = [];
  for (const slot of payloadSingle.slots) {
    const newSlot = await prisma.temporaryTimeTable.create({
      data: {
        branch_id: payloadSingle.branchId,
        semester: payloadSingle.sem,
        division: payloadSingle.division,
        date: parsedDate,
        startTimeHr: slot.startTimeHr,
        startTimeMinutes: slot.startTimeMinutes,
        endTimeHr: slot.endTimeHr,
        endTimeMinutes: slot.endTimeMinutes,
        subjectCode: slot.subjectCode,
        facultyid: BigInt(slot.facultyId),
        eventName: payloadSingle.eventName,
        typeOfLecture: 'Lecture',
        description: `Part of event: ${payloadSingle.eventName}`,
        createdBy: 2n
      }
    });
    createdSingle.push(newSlot);
  }
  console.log(`Created ${createdSingle.length} slots for single date.`);

  // Verify they exist in DB
  const verify = await prisma.temporaryTimeTable.findMany({
    where: {
      date: parsedDate,
      division: 'A'
    }
  });
  console.log(`Verified DB has ${verify.length} temporary slots for 2026-06-15`);
  for (const s of verify) {
    console.log(`  Slot ${s.startTimeHr}:${String(s.startTimeMinutes).padStart(2,'0')} - ${s.endTimeHr}:${String(s.endTimeMinutes).padStart(2,'0')} Subject: ${s.subjectCode} Faculty: ${s.facultyid}`);
  }
}

testBulk()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
