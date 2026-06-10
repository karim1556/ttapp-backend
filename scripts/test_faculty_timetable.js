const prisma = require('../src/config/prisma');

async function testTimetable(facultyIdOrUid) {
  console.log(`\n--- Testing getFacultyTimetable logic for ID: ${facultyIdOrUid} ---`);
  
  let facultyId = BigInt(facultyIdOrUid);

  // Resolve user uid to faculty_id if needed
  const facultyByUid = await prisma.faculty.findFirst({
    where: { uid: Number(facultyId) },
  });
  if (facultyByUid) {
    console.log(`Resolved user uid ${facultyId} to faculty_id ${facultyByUid.faculty_id} (${facultyByUid.name})`);
    facultyId = BigInt(facultyByUid.faculty_id);
  } else {
    const faculty = await prisma.faculty.findUnique({
      where: { faculty_id: Number(facultyId) }
    });
    if (faculty) {
      console.log(`Using faculty_id ${facultyId} (${faculty.name})`);
    } else {
      console.log(`Warning: Faculty/User ID ${facultyId} not found in DB`);
    }
  }

  // Find all batch_subjects for this faculty, join through slots to timetable
  const lectures = await prisma.timeTableBatchSubject.findMany({
    where: { facultyid: facultyId },
    include: {
      time_slot: {
        include: { timetable: true },
      },
    },
  });

  console.log(`Found ${lectures.length} lectures`);

  // Collect unique subject codes and faculty IDs to enrich names
  const subjectCodes = new Set();
  const facultyIds = new Set();
  for (const lec of lectures) {
    if (lec.subjectCode) subjectCodes.add(lec.subjectCode);
    if (lec.facultyid) facultyIds.add(Number(lec.facultyid));
  }

  const [subjects, facultyList] = await Promise.all([
    prisma.subject.findMany({
      where: { subject_code: { in: [...subjectCodes] } },
      select: { subject_code: true, subject_name: true },
    }),
    prisma.faculty.findMany({
      where: { faculty_id: { in: [...facultyIds] } },
      select: { faculty_id: true, name: true },
    }),
  ]);

  const subjectMap = Object.fromEntries(subjects.map((s) => [s.subject_code, s.subject_name]));
  const facultyMap = Object.fromEntries(facultyList.map((f) => [f.faculty_id, f.name]));

  // Build a day-grouped structure
  const dayMap = {};
  for (const lec of lectures) {
    const slot = lec.time_slot;
    if (!slot) continue;
    const tt = slot.timetable;
    if (!tt) continue;
    const day = tt.dateOfWeek || 'Unknown';

    if (!dayMap[day]) {
      dayMap[day] = {
        timetable: {
          id:          Number(tt.id),
          dateOfWeek:  tt.dateOfWeek,
          branch_id:   tt.branch_id,
          sem:         tt.sem,
          division:    tt.division,
          academic_id: tt.academic_id,
          fromDate:    tt.fromDate,
          toDate:      tt.toDate,
        },
        slotsMap: {},
      };
    }

    const slotId = Number(slot.id);
    if (!dayMap[day].slotsMap[slotId]) {
      dayMap[day].slotsMap[slotId] = {
        id:               slotId,
        timetable_id:     Number(slot.timetable_id),
        startTimeHr:      slot.startTimeHr,
        startTimeMinutes: slot.startTimeMinutes,
        endTimeHr:        slot.endTimeHr,
        endTimeMinutes:   slot.endTimeMinutes,
        lectures: [],
      };
    }

    dayMap[day].slotsMap[slotId].lectures.push({
      id:                     Number(lec.id),
      time_table_detailed_id: Number(lec.time_table_detailed_id),
      typeOfLecture:          lec.typeOfLecture,
      subjectCode:            lec.subjectCode,
      subject_name:           lec.subjectCode ? (subjectMap[lec.subjectCode] || null) : null,
      facultyid:              lec.facultyid ? Number(lec.facultyid) : null,
      faculty_name:           lec.facultyid ? (facultyMap[Number(lec.facultyid)] || null) : null,
      batch:                  lec.batch,
      room_number:            lec.room_number,
      is_extra:               lec.is_extra,
      lect_on_dehalf:         lec.lect_on_dehalf ? Number(lec.lect_on_dehalf) : null,
      reason:                 lec.reason,
    });
  }

  // Convert slotsMap to sorted slots list
  const result = {};
  for (const day of Object.keys(dayMap)) {
    const dayData = dayMap[day];
    const slotsList = Object.values(dayData.slotsMap);
    slotsList.sort((a, b) => {
      if (a.startTimeHr !== b.startTimeHr) {
        return a.startTimeHr - b.startTimeHr;
      }
      return a.startTimeMinutes - b.startTimeMinutes;
    });
    result[day] = {
      timetable: dayData.timetable,
      slots: slotsList,
    };
  }

  // Check JSON serialization
  const jsonString = JSON.stringify(result, null, 2);
  console.log('JSON Serialization check passed (no BigInt errors)!');
  
  // Print summary of days & slots
  for (const day of Object.keys(result)) {
    console.log(`\n  Day: ${day}`);
    console.log(`  Timetable: Sem ${result[day].timetable.sem}, Div ${result[day].timetable.division}`);
    for (const slot of result[day].slots) {
      console.log(`    Slot ${slot.startTimeHr}:${String(slot.startTimeMinutes).padStart(2, '0')} - ${slot.endTimeHr}:${String(slot.endTimeMinutes).padStart(2, '0')}`);
      for (const lec of slot.lectures) {
        console.log(`      Lecture: ${lec.subjectCode} (${lec.subject_name}) in Room ${lec.room_number}`);
      }
    }
  }
}

async function main() {
  // Test by user uid = 1 (linked to Prof. Manisha Patil)
  await testTimetable(1);

  // Test by faculty_id = 40 (Prof. Manisha Patil)
  await testTimetable(40);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
