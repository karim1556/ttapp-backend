'use strict';

const prisma = require('../config/prisma');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Normalizes a date to UTC midnight for consistent database comparison
 */
function normalizeDate(value) {
  if (!value) return null;
  
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  
  const str = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(Date.UTC(year, month, day));
  }
  
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

/**
 * Checks if two time ranges overlap
 */
function timeRangesOverlap(sh1, sm1, eh1, em1, sh2, sm2, eh2, em2) {
  const start1 = sh1 * 60 + sm1;
  const end1 = eh1 * 60 + em1;
  const start2 = sh2 * 60 + sm2;
  const end2 = eh2 * 60 + em2;
  return start1 < end2 && start2 < end1;
}

/**
 * Check if a faculty member is busy at a specific date and time range
 */
async function checkFacultyConflict({ facultyId, date, startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes }) {
  if (!facultyId) return null;
  const targetDate = normalizeDate(date);
  if (!targetDate) return null;
  const dayName = DAYS[targetDate.getUTCDay()];

  // 1. Check Standard Timetable
  const standardSchedules = await prisma.tblTimeTable.findMany({
    where: { dateOfWeek: dayName },
    include: {
      time_details: {
        include: { batch_subjects: true },
      },
    },
  });

  for (const tt of standardSchedules) {
    for (const slot of tt.time_details) {
      for (const bs of slot.batch_subjects) {
        if (bs.facultyid && BigInt(bs.facultyid) === BigInt(facultyId)) {
          if (timeRangesOverlap(
            startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes,
            slot.startTimeHr || 0, slot.startTimeMinutes || 0, slot.endTimeHr || 0, slot.endTimeMinutes || 0
          )) {
            return {
              type: 'standard_timetable',
              message: `Faculty is busy teaching standard subject ${bs.subjectCode} in Division ${tt.division} (Sem ${tt.sem})`,
            };
          }
        }
      }
    }
  }

  // 2. Check Substitution Records
  const substitutions = await prisma.substitutionRecord.findMany({
    where: {
      date: targetDate,
      status: { not: 'rejected' },
    },
  });

  for (const sub of substitutions) {
    // Check if faculty is either original or substitute
    const isOriginal = sub.original_faculty_id && BigInt(sub.original_faculty_id) === BigInt(facultyId);
    const isSubstitute = sub.substitute_faculty_id && BigInt(sub.substitute_faculty_id) === BigInt(facultyId);

    if (isSubstitute && sub.status === 'approved') {
      // Find the detailed slot time
      const slot = await prisma.timeTimeDetailed.findUnique({
        where: { id: sub.slot_id },
      });
      if (slot) {
        if (timeRangesOverlap(
          startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes,
          slot.startTimeHr || 0, slot.startTimeMinutes || 0, slot.endTimeHr || 0, slot.endTimeMinutes || 0
        )) {
          return {
            type: 'substitution',
            message: `Faculty is busy with substitution teaching for subject ${sub.subject_code}`,
          };
        }
      }
    }
  }

  // 3. Check Other Temporary Slots
  const tempSlots = await prisma.temporaryTimeTable.findMany({
    where: { date: targetDate },
  });

  for (const ts of tempSlots) {
    if (ts.facultyid && BigInt(ts.facultyid) === BigInt(facultyId)) {
      if (timeRangesOverlap(
        startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes,
        ts.startTimeHr, ts.startTimeMinutes, ts.endTimeHr, ts.endTimeMinutes
      )) {
        return {
          type: 'temporary_timetable',
          message: `Faculty is busy with temporary slot/event: ${ts.eventName || ts.subjectCode || 'Event'}`,
        };
      }
    }
  }

  return null;
}

/**
 * Check if a room is busy at a specific date and time range
 */
async function checkRoomConflict({ roomNumber, date, startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes }) {
  if (!roomNumber) return null;
  const targetDate = normalizeDate(date);
  if (!targetDate) return null;
  const dayName = DAYS[targetDate.getUTCDay()];
  const normalizedTarget = roomNumber.trim().toLowerCase();

  // 1. Check Standard Timetable
  const standardSchedules = await prisma.tblTimeTable.findMany({
    where: { dateOfWeek: dayName },
    include: {
      time_details: {
        include: { batch_subjects: true },
      },
    },
  });

  for (const tt of standardSchedules) {
    for (const slot of tt.time_details) {
      for (const bs of slot.batch_subjects) {
        if (bs.room_number && bs.room_number.trim().toLowerCase() === normalizedTarget) {
          if (timeRangesOverlap(
            startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes,
            slot.startTimeHr || 0, slot.startTimeMinutes || 0, slot.endTimeHr || 0, slot.endTimeMinutes || 0
          )) {
            return {
              type: 'standard_timetable',
              message: `Room ${roomNumber} is occupied by standard lecture ${bs.subjectCode} for Division ${tt.division}`,
            };
          }
        }
      }
    }
  }

  // 2. Check Other Temporary Slots
  const tempSlots = await prisma.temporaryTimeTable.findMany({
    where: {
      date: targetDate,
      room_number: { not: null },
    },
  });

  for (const ts of tempSlots) {
    if (ts.room_number && ts.room_number.trim().toLowerCase() === normalizedTarget) {
      if (timeRangesOverlap(
        startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes,
        ts.startTimeHr, ts.startTimeMinutes, ts.endTimeHr, ts.endTimeMinutes
      )) {
        return {
          type: 'temporary_timetable',
          message: `Room ${roomNumber} is occupied by temporary slot/event: ${ts.eventName || ts.subjectCode || 'Event'}`,
        };
      }
    }
  }

  return null;
}

/**
 * Algorithmic resource finder and temporary slot creator (no conflict validation)
 */
async function generateTemporarySlot({
  branchId, sem, division, date, startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes,
  subjectCode, eventName, description, createdBy
}) {
  const targetDate = normalizeDate(date);

  // 1. Resolve subject and its assigned professor
  const subject = await prisma.subject.findFirst({
    where: {
      subject_code: subjectCode,
      branch_id: parseInt(branchId, 10),
      semester: parseInt(sem, 10),
    },
  });

  if (!subject) {
    throw new Error(`Subject with code ${subjectCode} not found in database for Branch ${branchId} Sem ${sem}`);
  }

  const defaultFacultyId = subject.professor_assign ? parseInt(subject.professor_assign, 10) : null;
  if (!defaultFacultyId) {
    throw new Error(`Subject ${subjectCode} does not have a professor assigned to it`);
  }

  // 2. Find any active room of appropriate type (Lab for practicals, Classroom for theory) without checking conflicts
  const isLab = subject.ispractical === 'Yes';
  const targetRoomType = isLab ? 'Lab' : 'Classroom';

  let assignedRoom = await prisma.room.findFirst({
    where: { is_active: 1, room_type: targetRoomType },
    orderBy: { room_number: 'asc' },
  });

  if (!assignedRoom) {
    assignedRoom = await prisma.room.findFirst({
      where: { is_active: 1 },
      orderBy: { room_number: 'asc' },
    });
  }

  const roomNumberStr = assignedRoom ? assignedRoom.room_number : 'TBD';

  // 3. Create the slot
  const slot = await prisma.temporaryTimeTable.create({
    data: {
      branch_id: parseInt(branchId, 10),
      semester: parseInt(sem, 10),
      division,
      date: targetDate,
      startTimeHr,
      startTimeMinutes,
      endTimeHr,
      endTimeMinutes,
      subjectCode,
      facultyid: BigInt(defaultFacultyId),
      room_number: roomNumberStr,
      typeOfLecture: isLab ? 'Lab' : 'Lecture',
      eventName: eventName || `Temporary Lecture: ${subjectCode}`,
      description,
      createdBy: createdBy ? BigInt(createdBy) : null,
    },
  });

  return slot;
}

const PDFDocument = require('pdfkit');

async function generateTemporaryPdf(slots, { branchName, sem, division, dateRangeStr }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      // Styling constants
      const primaryColor = '#1A365D'; // Dark Navy
      const textColor = '#2D3748';    // Charcoal Text
      const lightGray = '#EDF2F7';    // Very Light Gray
      const white = '#FFFFFF';

      // Header
      doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold').text('Temporary Timetable / Event Schedule', { align: 'center' });
      doc.moveDown(0.3);
      
      // Sub-header info
      doc.fillColor(textColor).fontSize(10).font('Helvetica').text(`Class: ${branchName || 'N/A'} Sem ${sem || 'N/A'} - Div ${division || 'N/A'}`, { align: 'center' });
      doc.text(`Duration/Date: ${dateRangeStr || 'N/A'}`, { align: 'center' });
      doc.moveDown(1.5);

      // Table Header
      const tableTop = 150;
      const colWidths = {
        date: 85,
        time: 95,
        subject: 90,
        faculty: 100,
        room: 50,
        type: 70
      };
      
      const columns = [
        { label: 'Date', key: 'date', width: colWidths.date },
        { label: 'Time Slot', key: 'time', width: colWidths.time },
        { label: 'Subject', key: 'subject', width: colWidths.subject },
        { label: 'Teacher', key: 'faculty', width: colWidths.faculty },
        { label: 'Room', key: 'room', width: colWidths.room },
        { label: 'Type', key: 'type', width: colWidths.type }
      ];

      let y = tableTop;

      // Draw header row
      doc.rect(50, y, 490, 25).fill(primaryColor);
      doc.fillColor(white).font('Helvetica-Bold').fontSize(10);
      
      let currentX = 50;
      for (const col of columns) {
        doc.text(col.label, currentX + 5, y + 7, { width: col.width - 10, align: 'left' });
        currentX += col.width;
      }
      
      y += 25;
      
      // Sort slots by date and time
      slots.sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff !== 0) return dateDiff;
        if (a.startTimeHr !== b.startTimeHr) return a.startTimeHr - b.startTimeHr;
        return a.startTimeMinutes - b.startTimeMinutes;
      });

      // Draw rows
      doc.font('Helvetica').fontSize(9).fillColor(textColor);
      
      let isRowOdd = false;
      for (const slot of slots) {
        // Check for page overflow
        if (y > 720) {
          doc.addPage();
          y = 50; // New page top
          // Redraw table header on new page
          doc.rect(50, y, 490, 25).fill(primaryColor);
          doc.fillColor(white).font('Helvetica-Bold').fontSize(10);
          
          let headerX = 50;
          for (const col of columns) {
            doc.text(col.label, headerX + 5, y + 7, { width: col.width - 10, align: 'left' });
            headerX += col.width;
          }
          y += 25;
          doc.font('Helvetica').fontSize(9).fillColor(textColor);
        }

        // Draw background stripe
        if (isRowOdd) {
          doc.rect(50, y, 490, 24).fill(lightGray);
          doc.fillColor(textColor);
        } else {
          doc.rect(50, y, 490, 24).fill(white);
          doc.fillColor(textColor);
        }
        isRowOdd = !isRowOdd;

        // Format row values
        const dateObj = new Date(slot.date);
        const dateStr = dateObj.toISOString().split('T')[0];
        const timeStr = `${String(slot.startTimeHr).padStart(2, '0')}:${String(slot.startTimeMinutes).padStart(2, '0')} - ${String(slot.endTimeHr).padStart(2, '0')}:${String(slot.endTimeMinutes).padStart(2, '0')}`;
        
        const subjectName = slot.subjectCode || slot.eventName || 'N/A';
        const facultyName = slot.faculty_name || 'N/A';
        const roomNum = slot.room_number || 'N/A';
        const lectureType = slot.typeOfLecture || 'Lecture';

        // Draw cell texts
        let cellX = 50;
        
        doc.text(dateStr, cellX + 5, y + 7, { width: colWidths.date - 10, height: 15, ellipsis: true });
        cellX += colWidths.date;
        
        doc.text(timeStr, cellX + 5, y + 7, { width: colWidths.time - 10, height: 15, ellipsis: true });
        cellX += colWidths.time;
        
        doc.font('Helvetica-Bold').text(subjectName, cellX + 5, y + 7, { width: colWidths.subject - 10, height: 15, ellipsis: true }).font('Helvetica');
        cellX += colWidths.subject;
        
        doc.text(facultyName, cellX + 5, y + 7, { width: colWidths.faculty - 10, height: 15, ellipsis: true });
        cellX += colWidths.faculty;
        
        doc.text(roomNum, cellX + 5, y + 7, { width: colWidths.room - 10, height: 15, ellipsis: true });
        cellX += colWidths.room;
        
        doc.text(lectureType, cellX + 5, y + 7, { width: colWidths.type - 10, height: 15, ellipsis: true });
        
        // Draw bottom line border
        doc.rect(50, y, 490, 0.5).strokeColor('#E2E8F0').stroke();

        y += 24;
      }

      // Draw Footer
      doc.fillColor('#A0AEC0').fontSize(8).text('Generated by AI Timetable Management System', 50, 770, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  normalizeDate,
  checkFacultyConflict,
  checkRoomConflict,
  generateTemporarySlot,
  generateTemporaryPdf,
};
