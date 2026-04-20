'use strict';

const prisma = require('../config/prisma');
const { sendPushToToken } = require('./push.service');

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected', 'cancelled']);

function withStatus(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInt(value) {
  const parsed = toNumber(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseBigIntValue(value) {
  if (value === null || value === undefined || value === '') return null;

  try {
    if (typeof value === 'bigint') return value;
    return BigInt(String(value));
  } catch {
    return null;
  }
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function normalizeStatus(value) {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) return 'pending';
  return ALLOWED_STATUSES.has(normalized) ? normalized : 'pending';
}

function parseBoolean(value, defaultValue = false) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return defaultValue;
}

function parseDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const raw = String(value).trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toIso(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function normalizeDayName(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  const matched = DAY_NAMES.find((day) => day.toLowerCase() === raw.toLowerCase());
  return matched || raw;
}

function deriveDayNameFromDate(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
  return DAY_NAMES[dateObj.getUTCDay()] || null;
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getSlotHour(slotLike) {
  const hour =
    slotLike?.startHour
    ?? slotLike?.start_hour
    ?? slotLike?.hour
    ?? slotLike?.startTimeHr;

  const parsed = parsePositiveInt(hour);
  return parsed;
}

function isUnavailableForSlot(constraint, dayName, startTimeHr) {
  const unavailableSlots = parseJsonArray(constraint?.unavailable_slots);
  return unavailableSlots.some((slot) => {
    const day = normalizeDayName(slot?.day);
    return day === dayName && getSlotHour(slot) === startTimeHr;
  });
}

function isPreferredForSlot(constraint, dayName, startTimeHr) {
  const preferredSlots = parseJsonArray(constraint?.preferred_slots);
  return preferredSlots.some((slot) => {
    const day = normalizeDayName(slot?.day);
    return day === dayName && getSlotHour(slot) === startTimeHr;
  });
}

async function findFacultyIdByUid(uid) {
  const parsedUid = parsePositiveInt(uid);
  if (!parsedUid) return null;

  const faculty = await prisma.faculty.findFirst({
    where: { uid: parsedUid },
    select: { faculty_id: true },
  });

  return faculty?.faculty_id ?? null;
}

async function resolveFacultyIdFromAny(value) {
  const parsed = parsePositiveInt(value);
  if (!parsed) return null;

  const byFacultyId = await prisma.faculty.findUnique({
    where: { faculty_id: parsed },
    select: { faculty_id: true },
  });
  if (byFacultyId) return byFacultyId.faculty_id;

  const byUid = await prisma.faculty.findFirst({
    where: { uid: parsed },
    select: { faculty_id: true },
  });

  return byUid?.faculty_id ?? parsed;
}

async function buildBusyFacultySetForWeeklySlot({
  dayName,
  startTimeHr,
  startTimeMinutes,
  excludeLectureId,
}) {
  const rows = await prisma.timeTableBatchSubject.findMany({
    where: {
      id: excludeLectureId ? { not: excludeLectureId } : undefined,
      facultyid: { not: null },
      time_slot: {
        is: {
          startTimeHr,
          startTimeMinutes,
          timetable: {
            is: { dateOfWeek: dayName },
          },
        },
      },
    },
    select: { facultyid: true },
  });

  const result = new Set();
  for (const row of rows) {
    const facultyId = toNumber(row.facultyid);
    if (facultyId) result.add(facultyId);
  }

  return result;
}

async function buildBusyFacultySetForApprovedSubstitutions({
  date,
  dayName,
  startTimeHr,
  startTimeMinutes,
  excludeSubstitutionId,
}) {
  const substitutions = await prisma.substitutionRecord.findMany({
    where: {
      id: excludeSubstitutionId ? { not: excludeSubstitutionId } : undefined,
      date,
      status: 'approved',
      day_name: dayName,
    },
    select: {
      substitute_faculty_id: true,
      slot_id: true,
    },
  });

  if (!substitutions.length) return new Set();

  const slotIds = [
    ...new Set(
      substitutions
        .map((s) => s.slot_id)
        .filter((slotId) => slotId !== null && slotId !== undefined),
    ),
  ];

  if (!slotIds.length) return new Set();

  const slots = await prisma.timeTimeDetailed.findMany({
    where: { id: { in: slotIds } },
    select: {
      id: true,
      startTimeHr: true,
      startTimeMinutes: true,
    },
  });

  const matchingSlotIds = new Set(
    slots
      .filter((slot) => slot.startTimeHr === startTimeHr && slot.startTimeMinutes === startTimeMinutes)
      .map((slot) => String(slot.id)),
  );

  const result = new Set();
  for (const row of substitutions) {
    if (!matchingSlotIds.has(String(row.slot_id))) continue;
    const facultyId = parsePositiveInt(row.substitute_faculty_id);
    if (facultyId) result.add(facultyId);
  }

  return result;
}

async function buildLookupsForSubstitutionRows(rows) {
  const facultyIds = new Set();
  const subjectCodes = new Set();

  for (const row of rows) {
    if (row.original_faculty_id) facultyIds.add(row.original_faculty_id);
    if (row.substitute_faculty_id) facultyIds.add(row.substitute_faculty_id);
    if (row.subject_code) subjectCodes.add(row.subject_code);
  }

  const [facultyRows, subjectRows] = await Promise.all([
    facultyIds.size
      ? prisma.faculty.findMany({
        where: { faculty_id: { in: [...facultyIds] } },
        select: { faculty_id: true, name: true },
      })
      : [],
    subjectCodes.size
      ? prisma.subject.findMany({
        where: { subject_code: { in: [...subjectCodes] } },
        select: { subject_code: true, subject_name: true },
      })
      : [],
  ]);

  return {
    facultyMap: Object.fromEntries(
      facultyRows.map((f) => [f.faculty_id, f.name]),
    ),
    subjectMap: Object.fromEntries(
      subjectRows.map((s) => [s.subject_code, s.subject_name]),
    ),
  };
}

function serializeSubstitutionRow(row, lookup) {
  return {
    id: toNumber(row.id),
    lectureId: toNumber(row.lecture_id),
    slotId: toNumber(row.slot_id),
    date: formatDateOnly(row.date),
    dayName: row.day_name,
    originalFacultyId: row.original_faculty_id,
    originalFacultyName:
      row.original_faculty_name
      || lookup.facultyMap[row.original_faculty_id]
      || null,
    substituteFacultyId: row.substitute_faculty_id,
    substituteFacultyName:
      row.substitute_faculty_name
      || lookup.facultyMap[row.substitute_faculty_id]
      || null,
    subjectCode: row.subject_code,
    subjectName:
      row.subject_name
      || lookup.subjectMap[row.subject_code]
      || null,
    roomNumber: row.room_number,
    batch: row.batch,
    lectureType: row.lecture_type,
    status: row.status,
    reason: row.reason,
    approvedBy: row.approved_by,
    approvedAt: toIso(row.approved_at),
    temporaryOnly: row.temporary_only === 1,
    createdAt: toIso(row.created_at),
  };
}

async function serializeSubstitutionRows(rows) {
  if (!rows.length) return [];
  const lookup = await buildLookupsForSubstitutionRows(rows);
  return rows.map((row) => serializeSubstitutionRow(row, lookup));
}

async function getSlotContext({ lectureId, slotId }) {
  const lecture = lectureId
    ? await prisma.timeTableBatchSubject.findUnique({
      where: { id: lectureId },
      include: {
        time_slot: {
          include: { timetable: true },
        },
      },
    })
    : null;

  const resolvedSlotId = slotId || lecture?.time_table_detailed_id || null;
  if (!resolvedSlotId) throw withStatus(400, 'slotId is required');

  const slot = await prisma.timeTimeDetailed.findUnique({
    where: { id: resolvedSlotId },
    include: { timetable: true },
  });

  if (!slot) throw withStatus(404, 'Time slot not found');

  return { lecture, slot, resolvedSlotId };
}

async function sendSubstitutionNotifications(serializedRecord) {
  const payloadBase = {
    type: 'substitution',
    substitutionId: String(serializedRecord.id ?? ''),
    date: serializedRecord.date || '',
    dayName: serializedRecord.dayName || '',
    lectureId: String(serializedRecord.lectureId ?? ''),
  };

  const subject = serializedRecord.subjectName || serializedRecord.subjectCode || 'Lecture';
  const room = normalizeText(serializedRecord.roomNumber);
  const slotText = room ? ` in room ${room}` : '';

  if (serializedRecord.substituteFacultyId) {
    const substituteFaculty = await prisma.faculty.findUnique({
      where: { faculty_id: serializedRecord.substituteFacultyId },
      select: { uid: true },
    });

    if (substituteFaculty?.uid) {
      const tokenRow = await prisma.fcmToken.findUnique({
        where: { user_id: substituteFaculty.uid },
        select: { token: true },
      });

      if (tokenRow?.token) {
        await sendPushToToken({
          token: tokenRow.token,
          title: 'Substitution Assigned',
          body: `${subject} on ${serializedRecord.dayName} (${serializedRecord.date})${slotText}`,
          data: {
            ...payloadBase,
            role: 'substitute',
          },
        });
      }
    }
  }

  if (serializedRecord.originalFacultyId) {
    const originalFaculty = await prisma.faculty.findUnique({
      where: { faculty_id: serializedRecord.originalFacultyId },
      select: { uid: true },
    });

    if (originalFaculty?.uid) {
      const tokenRow = await prisma.fcmToken.findUnique({
        where: { user_id: originalFaculty.uid },
        select: { token: true },
      });

      if (tokenRow?.token) {
        await sendPushToToken({
          token: tokenRow.token,
          title: 'Substitution Confirmed',
          body: `${subject} has a substitute on ${serializedRecord.dayName} (${serializedRecord.date})`,
          data: {
            ...payloadBase,
            role: 'original',
          },
        });
      }
    }
  }
}

async function listSubstitutions({ requester, query }) {
  const where = {};

  const date = parseDateOnly(query.date);
  if (query.date && !date) throw withStatus(400, 'Invalid date. Expected yyyy-MM-dd');
  if (date) where.date = date;

  const status = normalizeText(query.status)?.toLowerCase();
  if (status) where.status = normalizeStatus(status);

  let facultyIdFilter = null;

  if (requester?.user_type === 2) {
    facultyIdFilter = await findFacultyIdByUid(requester.uid);

    // Fallback for clients that send uid in facultyId query.
    if (!facultyIdFilter && query.facultyId) {
      facultyIdFilter = await resolveFacultyIdFromAny(query.facultyId);
    }
  } else if (query.facultyId !== undefined) {
    facultyIdFilter = await resolveFacultyIdFromAny(query.facultyId);
  }

  if (facultyIdFilter) {
    where.OR = [
      { original_faculty_id: facultyIdFilter },
      { substitute_faculty_id: facultyIdFilter },
    ];
  }

  const rows = await prisma.substitutionRecord.findMany({
    where,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  });

  return serializeSubstitutionRows(rows);
}

async function previewCandidates({ payload }) {
  const lectureId = parseBigIntValue(payload.lectureId ?? payload.lecture_id);
  const slotId = parseBigIntValue(payload.slotId ?? payload.slot_id);

  const targetDate = parseDateOnly(payload.date);
  if (!targetDate) throw withStatus(400, 'date is required in yyyy-MM-dd format');

  const { lecture, slot } = await getSlotContext({ lectureId, slotId });

  const dayName =
    normalizeDayName(payload.dayName ?? payload.day_name)
    || normalizeDayName(slot.timetable?.dateOfWeek)
    || normalizeDayName(lecture?.time_slot?.timetable?.dateOfWeek)
    || deriveDayNameFromDate(targetDate);

  if (!dayName) throw withStatus(400, 'dayName is required');
  if (slot.startTimeHr === null || slot.startTimeHr === undefined) {
    throw withStatus(400, 'Invalid slot: start time missing');
  }

  const unavailableFacultyId =
    parsePositiveInt(payload.unavailableFacultyId ?? payload.unavailable_faculty_id)
    || parsePositiveInt(payload.originalFacultyId ?? payload.original_faculty_id)
    || toNumber(lecture?.facultyid);

  const [facultyRows, weeklyLoads, weeklyBusySet, approvedBusySet] = await Promise.all([
    prisma.faculty.findMany({
      where: { status: 1 },
      include: { constraints: true },
      orderBy: { name: 'asc' },
    }),
    prisma.timeTableBatchSubject.groupBy({
      by: ['facultyid'],
      where: { facultyid: { not: null } },
      _count: { _all: true },
    }),
    buildBusyFacultySetForWeeklySlot({
      dayName,
      startTimeHr: slot.startTimeHr,
      startTimeMinutes: slot.startTimeMinutes,
      excludeLectureId: lecture?.id || null,
    }),
    buildBusyFacultySetForApprovedSubstitutions({
      date: targetDate,
      dayName,
      startTimeHr: slot.startTimeHr,
      startTimeMinutes: slot.startTimeMinutes,
      excludeSubstitutionId: null,
    }),
  ]);

  const loadMap = {};
  for (const row of weeklyLoads) {
    const facultyId = toNumber(row.facultyid);
    if (!facultyId) continue;
    loadMap[facultyId] = row._count._all;
  }

  const candidates = [];

  for (const faculty of facultyRows) {
    const facultyId = parsePositiveInt(faculty.faculty_id);
    if (!facultyId) continue;
    if (unavailableFacultyId && facultyId === unavailableFacultyId) continue;

    const weeklyLoad = loadMap[facultyId] || 0;
    const preferred = isPreferredForSlot(faculty.constraints, dayName, slot.startTimeHr);
    const unavailable = isUnavailableForSlot(faculty.constraints, dayName, slot.startTimeHr);
    const hasConflict = unavailable || weeklyBusySet.has(facultyId) || approvedBusySet.has(facultyId);

    let score = 100;
    score -= weeklyLoad * 1.5;
    if (hasConflict) score -= 80;
    if (preferred) score += 10;

    const summary = hasConflict
      ? `Conflict likely at this slot. Current weekly load: ${weeklyLoad}`
      : `No immediate conflict detected. Current weekly load: ${weeklyLoad}`;

    candidates.push({
      facultyId,
      facultyName: faculty.name || `Faculty ${facultyId}`,
      score: Number(score.toFixed(2)),
      hasConflict,
      weeklyLoad,
      summary,
    });
  }

  candidates.sort((a, b) => {
    if (a.hasConflict !== b.hasConflict) return a.hasConflict ? 1 : -1;
    if (a.score !== b.score) return b.score - a.score;
    return a.weeklyLoad - b.weeklyLoad;
  });

  return candidates.slice(0, 10);
}

async function createSubstitution({ requester, payload }) {
  const lectureId = parseBigIntValue(payload.lectureId ?? payload.lecture_id);
  const slotId = parseBigIntValue(payload.slotId ?? payload.slot_id);
  const substituteFacultyId = parsePositiveInt(
    payload.substituteFacultyId ?? payload.substitute_faculty_id,
  );

  if (!lectureId) throw withStatus(400, 'lectureId is required');
  if (!substituteFacultyId) throw withStatus(400, 'substituteFacultyId is required');

  const date = parseDateOnly(payload.date);
  if (!date) throw withStatus(400, 'date is required in yyyy-MM-dd format');

  const { lecture, slot, resolvedSlotId } = await getSlotContext({ lectureId, slotId });

  if (!lecture) throw withStatus(404, 'Lecture not found');

  const dayName =
    normalizeDayName(payload.dayName ?? payload.day_name)
    || normalizeDayName(slot.timetable?.dateOfWeek)
    || normalizeDayName(lecture.time_slot?.timetable?.dateOfWeek)
    || deriveDayNameFromDate(date);

  if (!dayName) throw withStatus(400, 'dayName is required');

  const existing = await prisma.substitutionRecord.findFirst({
    where: { lecture_id: lectureId, date },
  });

  const [substituteFaculty, originalFaculty] = await Promise.all([
    prisma.faculty.findUnique({
      where: { faculty_id: substituteFacultyId },
      select: { faculty_id: true, name: true },
    }),
    lecture.facultyid
      ? prisma.faculty.findUnique({
        where: { faculty_id: toNumber(lecture.facultyid) },
        select: { faculty_id: true, name: true },
      })
      : null,
  ]);

  if (!substituteFaculty) {
    throw withStatus(404, 'Substitute faculty not found');
  }

  const weeklyBusySet = await buildBusyFacultySetForWeeklySlot({
    dayName,
    startTimeHr: slot.startTimeHr,
    startTimeMinutes: slot.startTimeMinutes,
    excludeLectureId: lectureId,
  });

  if (weeklyBusySet.has(substituteFacultyId)) {
    throw withStatus(409, 'Faculty conflict: substitute is already assigned in this slot');
  }

  const approvedBusySet = await buildBusyFacultySetForApprovedSubstitutions({
    date,
    dayName,
    startTimeHr: slot.startTimeHr,
    startTimeMinutes: slot.startTimeMinutes,
    excludeSubstitutionId: existing?.id || null,
  });

  if (approvedBusySet.has(substituteFacultyId)) {
    throw withStatus(409, 'Substitution conflict: substitute already has an approved replacement in this slot');
  }

  const autoApprove = parseBoolean(payload.autoApprove ?? payload.auto_approve, false);
  const status = autoApprove
    ? 'approved'
    : normalizeStatus(payload.status);

  const shouldApprove = status === 'approved';

  const approvedBy = shouldApprove
    ? (parsePositiveInt(payload.approvedBy ?? payload.approved_by) || requester?.uid || null)
    : null;

  const approvedAt = shouldApprove ? new Date() : null;
  const notifyAssignedFaculty = parseBoolean(
    payload.notifyAssignedFaculty ?? payload.notify_assigned_faculty,
    true,
  );

  const subjectCode =
    normalizeText(payload.subjectCode ?? payload.subject_code)
    || normalizeText(lecture.subjectCode);

  let subjectName = normalizeText(payload.subjectName ?? payload.subject_name);
  if (!subjectName && subjectCode) {
    const subject = await prisma.subject.findFirst({
      where: { subject_code: subjectCode },
      select: { subject_name: true },
    });
    subjectName = subject?.subject_name || null;
  }

  const data = {
    lecture_id: lectureId,
    slot_id: resolvedSlotId,
    date,
    day_name: dayName,
    original_faculty_id:
      parsePositiveInt(payload.originalFacultyId ?? payload.original_faculty_id)
      || toNumber(lecture.facultyid)
      || null,
    original_faculty_name:
      normalizeText(payload.originalFacultyName ?? payload.original_faculty_name)
      || originalFaculty?.name
      || null,
    substitute_faculty_id: substituteFacultyId,
    substitute_faculty_name:
      normalizeText(payload.substituteFacultyName ?? payload.substitute_faculty_name)
      || substituteFaculty.name
      || null,
    subject_code: subjectCode,
    subject_name: subjectName,
    room_number:
      normalizeText(payload.roomNumber ?? payload.room_number)
      || normalizeText(lecture.room_number),
    batch: normalizeText(payload.batch) || normalizeText(lecture.batch),
    lecture_type:
      normalizeText(payload.lectureType ?? payload.lecture_type)
      || normalizeText(lecture.typeOfLecture),
    status,
    reason: normalizeText(payload.reason),
    approved_by: approvedBy,
    approved_at: approvedAt,
    temporary_only: parseBoolean(payload.temporaryOnly ?? payload.temporary_only, true) ? 1 : 0,
    created_by: requester?.uid || null,
  };

  let saved;
  if (existing) {
    saved = await prisma.substitutionRecord.update({
      where: { id: existing.id },
      data,
    });
  } else {
    saved = await prisma.substitutionRecord.create({ data });
  }

  const [serialized] = await serializeSubstitutionRows([saved]);

  if (notifyAssignedFaculty && serialized?.status === 'approved') {
    try {
      await sendSubstitutionNotifications(serialized);
    } catch {
      // Notifications should not fail substitution creation.
    }
  }

  return serialized;
}

async function approveSubstitution({ requester, substitutionId, payload }) {
  const parsedId = parseBigIntValue(substitutionId);
  if (!parsedId) throw withStatus(400, 'Invalid substitution id');

  const existing = await prisma.substitutionRecord.findUnique({
    where: { id: parsedId },
  });

  if (!existing) throw withStatus(404, 'Substitution not found');

  const approvedBy =
    parsePositiveInt(payload?.approvedBy ?? payload?.approved_by)
    || requester?.uid
    || existing.approved_by
    || null;

  const saved = await prisma.substitutionRecord.update({
    where: { id: parsedId },
    data: {
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date(),
    },
  });

  const [serialized] = await serializeSubstitutionRows([saved]);

  try {
    await sendSubstitutionNotifications(serialized);
  } catch {
    // Approval success should not depend on push delivery.
  }

  return serialized;
}

module.exports = {
  listSubstitutions,
  previewCandidates,
  createSubstitution,
  approveSubstitution,
};
