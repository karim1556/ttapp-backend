'use strict';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';
const BRANCH_ID = 1;
const EVEN_SEMESTERS = [2, 4, 6, 8];
const DIVISIONS = ['A', 'B', 'C'];
const EXPECTED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: res.status, json, text };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeClassKey(branchId, sem, division) {
  return `${branchId}_${String(sem)}_${String(division).toUpperCase()}`;
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function main() {
  console.log('Starting full-flow verification for even semesters...');

  const login = await call('/auth/login', {
    method: 'POST',
    body: {
      email: 'admin@ttapp.com',
      password: 'admin123',
    },
  });

  assert(login.status === 200, `Login failed: ${login.status} ${login.text}`);
  const token = login.json?.data?.token;
  assert(token, 'No token received after login');
  console.log('Login check: PASS');

  const generation = await call('/timetable/generate-all', {
    method: 'POST',
    token,
    body: {
      academicYear: '2025-26',
      branchIds: [BRANCH_ID],
      semesters: EVEN_SEMESTERS,
      divisions: DIVISIONS,
    },
  });

  assert(generation.status === 200, `Generate-all failed: ${generation.status} ${generation.text}`);
  assert(generation.json?.success === true, 'Generate-all did not return success=true');

  const unplaced = parseNumber(generation.json?.data?.optimization?.unplacedLectures);
  assert(unplaced === 0, `Unplaced lectures should be 0, got ${unplaced}`);
  console.log('Generate-all check: PASS');

  const weekly = await call(`/timetable/weekly?branchId=${BRANCH_ID}`, { token });
  assert(weekly.status === 200, `Weekly fetch failed: ${weekly.status} ${weekly.text}`);
  const data = weekly.json?.data;
  assert(Array.isArray(data), 'Weekly data is not an array');

  const expectedClassKeys = new Set();
  for (const sem of EVEN_SEMESTERS) {
    for (const division of DIVISIONS) {
      expectedClassKeys.add(makeClassKey(BRANCH_ID, sem, division));
    }
  }

  const classDayMap = new Map();
  const classLectureMap = new Map();
  const classDayLabSlotMap = new Map();
  const facultyConflicts = [];
  const roomConflicts = [];
  const facultySlotMap = new Map();
  const roomSlotMap = new Map();

  for (const dayRow of data) {
    const sem = parseNumber(dayRow.sem);
    const division = String(dayRow.division || '').toUpperCase();
    const branch = parseNumber(dayRow.branch_id);
    const day = String(dayRow.dateOfWeek || '');

    if (!branch || !sem || !division || !day) continue;

    assert(EVEN_SEMESTERS.includes(sem), `Found unexpected odd semester in timetable: ${sem}`);
    assert(EXPECTED_DAYS.includes(day), `Found unexpected day in timetable: ${day}`);

    const classKey = makeClassKey(branch, sem, division);
    const classDayKey = `${classKey}_${day}`;
    if (!classDayMap.has(classKey)) classDayMap.set(classKey, new Set());
    classDayMap.get(classKey).add(day);

    let lectureCountForRow = 0;

    for (const slot of dayRow.slots || []) {
      const startHr = parseNumber(slot.startTimeHr);
      const startMin = parseNumber(slot.startTimeMinutes);
      const slotTag = `${day}_${startHr}_${startMin}`;

      for (const lecture of slot.lectures || []) {
        lectureCountForRow += 1;

        if (lecture.typeOfLecture === 'Lab') {
          classDayLabSlotMap.set(classDayKey, (classDayLabSlotMap.get(classDayKey) || 0) + 1);
        }

        const facultyId = parseNumber(lecture.facultyid);
        if (facultyId) {
          const key = `${slotTag}_${facultyId}`;
          if (facultySlotMap.has(key) && facultySlotMap.get(key) !== classKey) {
            facultyConflicts.push({
              key,
              first: facultySlotMap.get(key),
              second: classKey,
            });
          } else {
            facultySlotMap.set(key, classKey);
          }
        }

        const roomNumber = String(lecture.room_number || '').trim();
        if (roomNumber) {
          const key = `${slotTag}_${roomNumber}`;
          if (roomSlotMap.has(key) && roomSlotMap.get(key) !== classKey) {
            roomConflicts.push({
              key,
              first: roomSlotMap.get(key),
              second: classKey,
            });
          } else {
            roomSlotMap.set(key, classKey);
          }
        }
      }
    }

    classLectureMap.set(classKey, (classLectureMap.get(classKey) || 0) + lectureCountForRow);
  }

  for (const key of expectedClassKeys) {
    const days = classDayMap.get(key);
    assert(days, `Missing timetable for class ${key}`);

    for (const dayName of EXPECTED_DAYS) {
      assert(days.has(dayName), `Class ${key} missing day ${dayName}`);

      const classDayKey = `${key}_${dayName}`;
      const labSlots = classDayLabSlotMap.get(classDayKey) || 0;
      assert(labSlots <= 2, `Class ${key} has more than one lab block on ${dayName} (${labSlots} lab slots)`);
      assert(
        labSlots === 0 || labSlots === 2,
        `Class ${key} has invalid lab duration on ${dayName} (${labSlots} lab slots)`,
      );
    }

    const lectures = classLectureMap.get(key) || 0;
    assert(lectures > 0, `Class ${key} has zero lecture assignments`);
  }

  assert(facultyConflicts.length === 0, `Faculty conflicts found: ${JSON.stringify(facultyConflicts[0])}`);
  assert(roomConflicts.length === 0, `Room conflicts found: ${JSON.stringify(roomConflicts[0])}`);
  console.log('Weekly timetable integrity check: PASS');

  const report = await call('/timetable/reports/classroom-usage', { token });
  assert(report.status === 200, `Room report failed: ${report.status} ${report.text}`);
  const rooms = report.json?.data?.rooms;
  assert(Array.isArray(rooms) && rooms.length > 0, 'Room report returned no data');

  const topRoom = String(rooms[0].roomNumber || '').trim();
  assert(topRoom, 'Top room number missing in room report');

  const roomWeekly = await call(`/timetable/room/${encodeURIComponent(topRoom)}/weekly`, { token });
  assert(roomWeekly.status === 200, `Room weekly failed: ${roomWeekly.status} ${roomWeekly.text}`);
  const roomWeekData = roomWeekly.json?.data;
  assert(Array.isArray(roomWeekData), 'Room weekly data is not an array');
  assert(
    roomWeekData.length === EXPECTED_DAYS.length,
    `Room weekly should return ${EXPECTED_DAYS.length} days, got ${roomWeekData.length}`,
  );
  console.log('Room APIs check: PASS');

  console.log('\nFULL FLOW CHECK PASSED');
  console.log(`  Classes validated: ${expectedClassKeys.size}`);
  console.log(`  Semester set: ${EVEN_SEMESTERS.join(', ')}`);
  console.log(`  Divisions validated: ${DIVISIONS.join(', ')}`);
  console.log(`  Unplaced lectures: ${unplaced}`);
}

main().catch((err) => {
  console.error('FULL FLOW CHECK FAILED');
  console.error(err.message);
  process.exit(1);
});
