'use strict';

const prisma = require('./src/config/prisma');
const tempService = require('./src/services/temporary.service');
const tempCtrl = require('./src/controllers/temporary.controller');

// Mock request / response helpers
function mockResponse() {
  const res = {
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    json: (data) => {
      res.jsonData = data;
      return res;
    },
    statusCode: 200,
    jsonData: null,
  };
  return res;
}

async function runTests() {
  console.log('=== RUNNING TEMPORARY TIMETABLE TESTS ===\n');

  try {
    const today = new Date();
    const branchId = 1;
    const sem = 4;
    const division = 'A';

    // Cleanup any existing temporary entries
    await prisma.temporaryTimeTable.deleteMany({});
    console.log('1. Cleared existing temporary timetable entries.');

    // 2. Fetch the standard timetable for today
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDayOfWeek = DAYS[today.getDay()];
    console.log(`\nToday is ${todayDayOfWeek} (${today.toISOString().split('T')[0]})`);

    // Let's create a manual temporary event at 14:00-16:00
    // Faculty: Prof. Tina Sawant (ID: 48)
    // Room: 311
    const reqCreate = {
      body: {
        branchId,
        sem,
        division,
        date: today,
        startTimeHr: 14,
        startTimeMinutes: 0,
        endTimeHr: 16,
        endTimeMinutes: 0,
        subjectCode: 'DT',
        facultyId: 48,
        roomNumber: '311',
        eventName: 'Guest Lecture on Innovation',
        typeOfLecture: 'Lecture',
        description: 'Special guest lecture for SE Sem 4',
      },
      user: { uid: 1 },
    };

    const resCreate = mockResponse();
    await tempCtrl.create(reqCreate, resCreate);

    if (resCreate.statusCode !== 201) {
      throw new Error(`Failed to create manual temporary slot: ${JSON.stringify(resCreate.jsonData)}`);
    }

    console.log('2. Successfully created manual temporary slot (Guest Lecture).');
    console.log('   Saved slot:', JSON.stringify(resCreate.jsonData.data, null, 2));

    // 3. Try to create a conflicting slot (same room at same time)
    const reqConflict = {
      body: {
        branchId,
        sem,
        division,
        date: today,
        startTimeHr: 15,
        startTimeMinutes: 0,
        endTimeHr: 16,
        endTimeMinutes: 0,
        subjectCode: 'DBMS',
        facultyId: 40, // MPA
        roomNumber: '311', // CONFLICT!
        eventName: 'Conflicting DBMS session',
        typeOfLecture: 'Lecture',
      },
      user: { uid: 1 },
    };

    const resConflict = mockResponse();
    await tempCtrl.create(reqConflict, resConflict);

    if (resConflict.statusCode === 409) {
      console.log('3. Successfully blocked conflicting slot (Room 311 busy). Result:', resConflict.jsonData.message);
    } else {
      throw new Error(`Expected conflict error (409) but got code ${resConflict.statusCode}: ${JSON.stringify(resConflict.jsonData)}`);
    }

    // 4. Test Algorithmic Generation
    // We want to generate a temporary slot for DBMS at 16:00-17:00
    // Since DBMS uses MPA (40) and MPA is free, it should find a free room and schedule it
    const reqGen = {
      body: {
        branchId,
        sem,
        division,
        date: today,
        startTimeHr: 10,
        startTimeMinutes: 0,
        endTimeHr: 11,
        endTimeMinutes: 0,
        subjectCode: 'DBMS',
        eventName: 'Auto Generated DBMS Lecture',
        description: 'Testing automatic temporary slot generation',
      },
      user: { uid: 1 },
    };

    const resGen = mockResponse();
    await tempCtrl.generate(reqGen, resGen);

    if (resGen.statusCode !== 201) {
      throw new Error(`Failed to generate algorithmic temporary slot: ${JSON.stringify(resGen.jsonData)}`);
    }

    console.log('\n4. Successfully generated algorithmic temporary slot.');
    console.log('   Generated Slot:', JSON.stringify(resGen.jsonData.data, null, 2));

    // 5. Query /today endpoint and check overrides
    // Let's call ctrl.getToday from timetable.controller
    const timetableCtrl = require('./src/controllers/timetable.controller');
    const reqToday = {
      query: {
        branchId,
        sem,
        division,
      },
    };
    const resToday = mockResponse();
    await timetableCtrl.getToday(reqToday, resToday);

    if (resToday.statusCode !== 200) {
      throw new Error(`Failed to fetch today's timetable: ${JSON.stringify(resToday.jsonData)}`);
    }

    console.log('\n5. Successfully fetched today\'s timetable with overrides:');
    const dayData = resToday.jsonData.data[0];
    if (!dayData) {
      console.log('   No timetable found for today (standard).');
    } else {
      for (const slot of dayData.slots) {
        const timeStr = `${String(slot.startTimeHr).padStart(2, '0')}:${String(slot.startTimeMinutes).padStart(2, '0')}-${String(slot.endTimeHr).padStart(2, '0')}:${String(slot.endTimeMinutes).padStart(2, '0')}`;
        for (const lec of slot.lectures) {
          const isTemp = lec.is_extra === 1 ? ' [TEMPORARY]' : '';
          console.log(`   ${timeStr} ${lec.subjectCode || 'Event'}: "${lec.subject_name}" room=${lec.room_number}${isTemp}`);
        }
      }
    }

    // 6. Delete a temporary slot
    const slotIdToDelete = resGen.jsonData.data.id;
    const reqDel = {
      params: { id: slotIdToDelete },
    };
    const resDel = mockResponse();
    await tempCtrl.delete(reqDel, resDel);

    if (resDel.statusCode !== 200) {
      throw new Error(`Failed to delete temporary slot: ${JSON.stringify(resDel.jsonData)}`);
    }
    console.log(`\n6. Successfully deleted temporary slot (ID: ${slotIdToDelete}).`);

    // Clean up all entries to restore clean database
    await prisma.temporaryTimeTable.deleteMany({});
    console.log('7. Cleaned up remaining temporary records. Tests completed successfully!');

  } catch (err) {
    console.error('\n❌ Test execution failed:', err.message);
    console.error(err.stack);
  }

  await prisma.$disconnect();
}

runTests();
