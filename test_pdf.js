'use strict';

const prisma = require('./src/config/prisma');
const tempCtrl = require('./src/controllers/temporary.controller');
const fs = require('fs');
const path = require('path');

// Mock response helpers
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
    send: (data) => {
      res.bodyData = data;
      return res;
    },
    setHeader: (name, value) => {
      res.headers[name] = value;
      return res;
    },
    statusCode: 200,
    jsonData: null,
    bodyData: null,
    headers: {},
  };
  return res;
}

async function runTests() {
  console.log('=== RUNNING SIMPLIFIED TEMPORARY TIMETABLE AND PDF TESTS ===\n');

  try {
    const branchId = 1;
    const sem = 4;
    const division = 'A';
    
    // We will test scheduling for a date range: today and tomorrow
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const fromDateStr = today.toISOString().split('T')[0];
    const toDateStr = tomorrow.toISOString().split('T')[0];

    console.log(`Date range: ${fromDateStr} to ${toDateStr}`);

    // 1. Cleanup existing temporary entries
    await prisma.temporaryTimeTable.deleteMany({});
    console.log('1. Cleared existing temporary timetable entries.');

    // 2. Create manual temporary slot for a date range (Guest Lecture)
    const reqCreate = {
      body: {
        branchId,
        sem,
        division,
        fromDate: fromDateStr,
        toDate: toDateStr,
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
      throw new Error(`Failed to create manual temporary slots: ${JSON.stringify(resCreate.jsonData)}`);
    }

    console.log('2. Successfully created manual temporary slots for date range.');
    console.log('   Saved slots count:', Array.isArray(resCreate.jsonData.data) ? resCreate.jsonData.data.length : 1);
    console.log('   Saved slots IDs:', Array.isArray(resCreate.jsonData.data) ? resCreate.jsonData.data.map(d => d.id) : resCreate.jsonData.data.id);

    // 3. Algorithmic generation for the same time slot (which would have conflicted before, but now bypasses conflict check)
    const reqGen = {
      body: {
        branchId,
        sem,
        division,
        date: fromDateStr,
        startTimeHr: 14, // Same time, same room! No conflict error expected.
        startTimeMinutes: 0,
        endTimeHr: 15,
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

    console.log('\n3. Successfully generated algorithmic temporary slot (bypassing conflicts).');
    console.log('   Generated Slot:', JSON.stringify(resGen.jsonData.data, null, 2));

    // 4. List the temporary slots
    const reqList = {
      query: {
        branchId,
        sem,
        division,
        fromDate: fromDateStr,
        toDate: toDateStr,
      },
    };
    const resList = mockResponse();
    await tempCtrl.list(reqList, resList);

    if (resList.statusCode !== 200) {
      throw new Error(`Failed to list temporary slots: ${JSON.stringify(resList.jsonData)}`);
    }

    console.log('\n4. Listed temporary slots successfully.');
    console.log(`   Found ${resList.jsonData.data.length} slots.`);

    // 5. Test PDF download endpoint
    const reqPdf = {
      query: {
        branchId,
        sem,
        division,
        fromDate: fromDateStr,
        toDate: toDateStr,
      },
    };
    const resPdf = mockResponse();
    await tempCtrl.downloadPdf(reqPdf, resPdf);

    if (resPdf.statusCode !== 200) {
      throw new Error(`Failed to generate PDF: ${JSON.stringify(resPdf.jsonData)}`);
    }

    console.log('\n5. Successfully generated PDF buffer.');
    console.log('   Headers:', resPdf.headers);
    console.log('   PDF Buffer Size:', resPdf.bodyData.length, 'bytes');

    // Save PDF locally to inspect/verify
    const pdfPath = path.join(__dirname, 'temporary_timetable_test.pdf');
    fs.writeFileSync(pdfPath, resPdf.bodyData);
    console.log(`   Saved PDF locally to: ${pdfPath}`);

    // 6. Clean up database
    await prisma.temporaryTimeTable.deleteMany({});
    console.log('\n6. Cleaned up temporary records from database. Tests completed successfully!');

  } catch (err) {
    console.error('\n❌ Test execution failed:', err.message);
    console.error(err.stack);
  }

  await prisma.$disconnect();
}

runTests();
