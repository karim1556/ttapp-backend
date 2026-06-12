'use strict';

const prisma = require('../config/prisma');
const tempService = require('../services/temporary.service');

// Helper to serialize BigInts and Dates
function serialize(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serialize);
  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, serialize(v)])
    );
  }
  return obj;
}

/**
 * Manually create a temporary slot / event (supports date ranges)
 */
const create = async (req, res) => {
  try {
    const {
      branchId, sem, division, date, fromDate, toDate, startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes,
      subjectCode, facultyId, roomNumber, eventName, typeOfLecture, description
    } = req.body;

    // Validate parameters
    if (!branchId || !sem || !division || startTimeHr === undefined || startTimeMinutes === undefined || endTimeHr === undefined || endTimeMinutes === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    // Determine target dates
    let targetDates = [];
    if (fromDate && toDate) {
      let current = tempService.normalizeDate(fromDate);
      const end = tempService.normalizeDate(toDate);
      if (!current || !end) {
        return res.status(400).json({ success: false, message: 'Invalid fromDate or toDate format' });
      }
      while (current <= end) {
        targetDates.push(new Date(current));
        current.setUTCDate(current.getUTCDate() + 1);
      }
    } else if (date) {
      const parsedDate = tempService.normalizeDate(date);
      if (!parsedDate) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }
      targetDates.push(parsedDate);
    } else {
      return res.status(400).json({ success: false, message: 'Must provide either date, or fromDate and toDate' });
    }

    // Create entry/entries without conflict checks
    const createdSlots = [];
    for (const targetDate of targetDates) {
      const newSlot = await prisma.temporaryTimeTable.create({
        data: {
          branch_id: parseInt(branchId, 10),
          semester: parseInt(sem, 10),
          division,
          date: targetDate,
          startTimeHr,
          startTimeMinutes,
          endTimeHr,
          endTimeMinutes,
          subjectCode: subjectCode || null,
          facultyid: facultyId ? BigInt(facultyId) : null,
          room_number: roomNumber || null,
          typeOfLecture: typeOfLecture || 'Lecture',
          eventName: eventName || null,
          description: description || null,
          createdBy: req.user?.uid ? BigInt(req.user.uid) : null,
        },
      });
      createdSlots.push(newSlot);
    }

    return res.status(201).json({ success: true, data: serialize(createdSlots.length === 1 ? createdSlots[0] : createdSlots) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * List temporary slots / events
 */
const list = async (req, res) => {
  try {
    const { branchId, sem, division, date, fromDate, toDate } = req.query;
    const where = {};

    if (branchId) where.branch_id = parseInt(branchId, 10);
    if (sem)      where.semester  = parseInt(sem, 10);
    if (division) where.division  = division;
    
    if (fromDate && toDate) {
      const start = tempService.normalizeDate(fromDate);
      const end = tempService.normalizeDate(toDate);
      if (start && end) {
        where.date = { gte: start, lte: end };
      }
    } else if (date) {
      const parsedDate = tempService.normalizeDate(date);
      if (parsedDate) where.date = parsedDate;
    }

    const slots = await prisma.temporaryTimeTable.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
    });

    return res.json({ success: true, data: serialize(slots) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Delete a temporary slot / event
 */
const remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    const exists = await prisma.temporaryTimeTable.findUnique({ where: { id } });
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Temporary slot not found' });
    }

    await prisma.temporaryTimeTable.delete({ where: { id } });
    return res.json({ success: true, message: 'Temporary slot deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Automatically find resources and generate temporary slot(s)
 */
const generate = async (req, res) => {
  try {
    const {
      branchId, sem, division, date, fromDate, toDate, startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes,
      subjectCode, eventName, description
    } = req.body;

    if (!branchId || !sem || !division || startTimeHr === undefined || startTimeMinutes === undefined || endTimeHr === undefined || endTimeMinutes === undefined || !subjectCode) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    let targetDates = [];
    if (fromDate && toDate) {
      let current = tempService.normalizeDate(fromDate);
      const end = tempService.normalizeDate(toDate);
      if (!current || !end) {
        return res.status(400).json({ success: false, message: 'Invalid fromDate or toDate format' });
      }
      while (current <= end) {
        targetDates.push(new Date(current));
        current.setUTCDate(current.getUTCDate() + 1);
      }
    } else if (date) {
      const parsedDate = tempService.normalizeDate(date);
      if (!parsedDate) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }
      targetDates.push(parsedDate);
    } else {
      return res.status(400).json({ success: false, message: 'Must provide either date, or fromDate and toDate' });
    }

    const generatedSlots = [];
    for (const targetDate of targetDates) {
      const slot = await tempService.generateTemporarySlot({
        branchId, sem, division, date: targetDate, startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes,
        subjectCode, eventName, description, createdBy: req.user?.uid
      });
      generatedSlots.push(slot);
    }

    return res.status(201).json({ success: true, data: serialize(generatedSlots.length === 1 ? generatedSlots[0] : generatedSlots) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Generate and download a PDF version of the temporary timetable
 */
const downloadPdf = async (req, res) => {
  try {
    const { branchId, sem, division, date, fromDate, toDate } = req.query;
    const where = {};

    if (branchId) where.branch_id = parseInt(branchId, 10);
    if (sem)      where.semester  = parseInt(sem, 10);
    if (division) where.division  = division;

    if (fromDate && toDate) {
      const start = tempService.normalizeDate(fromDate);
      const end = tempService.normalizeDate(toDate);
      if (start && end) {
        where.date = { gte: start, lte: end };
      }
    } else if (date) {
      const parsedDate = tempService.normalizeDate(date);
      if (parsedDate) where.date = parsedDate;
    }

    const slots = await prisma.temporaryTimeTable.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
    });

    if (!slots.length) {
      return res.status(404).json({ success: false, message: 'No temporary timetable slots found matching the criteria' });
    }

    // Enrich slots with faculty name and subject name
    const facultyIds = [...new Set(slots.map(s => s.facultyid ? Number(s.facultyid) : null).filter(Boolean))];
    const facultyList = await prisma.faculty.findMany({
      where: { faculty_id: { in: facultyIds } },
      select: { faculty_id: true, name: true }
    });
    const facultyMap = Object.fromEntries(facultyList.map(f => [f.faculty_id, f.name]));

    const subjectCodes = [...new Set(slots.map(s => s.subjectCode).filter(Boolean))];
    const subjectList = await prisma.subject.findMany({
      where: { subject_code: { in: subjectCodes } },
      select: { subject_code: true, subject_name: true }
    });
    const subjectMap = Object.fromEntries(subjectList.map(s => [s.subject_code, s.subject_name]));

    const enrichedSlots = slots.map(s => ({
      ...s,
      faculty_name: s.facultyid ? (facultyMap[Number(s.facultyid)] || null) : null,
      subject_name: s.subjectCode ? (subjectMap[s.subjectCode] || s.subjectCode) : null
    }));

    // Resolve eventName (purpose/occasion)
    const firstWithEvent = slots.find(s => s.eventName);
    const eventName = firstWithEvent ? firstWithEvent.eventName : null;

    // Resolve Branch name for report header
    let branchName = 'N/A';
    if (branchId) {
      switch (parseInt(branchId, 10)) {
        case 1: branchName = 'Computer Science'; break;
        case 2: branchName = 'Information Technology'; break;
        case 3: branchName = 'EXTC'; break;
        case 4: branchName = 'Mechanical Engineering'; break;
        default: branchName = `Branch ${branchId}`;
      }
    }

    // Format Date Range string for report header
    let dateRangeStr = '';
    if (fromDate && toDate) {
      dateRangeStr = `${fromDate} to ${toDate}`;
    } else if (date) {
      dateRangeStr = String(date);
    } else {
      const dates = slots.map(s => new Date(s.date));
      const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
      const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0];
      dateRangeStr = minDate === maxDate ? minDate : `${minDate} to ${maxDate}`;
    }

    const pdfBuffer = await tempService.generateTemporaryPdf(enrichedSlots, {
      branchName,
      sem,
      division,
      dateRangeStr,
      eventName
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=temporary_timetable_${branchId || 'class'}_sem${sem || ''}_div${division || ''}.pdf`);
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Bulk create/replace temporary slots for single date or date range
 */
const createBulk = async (req, res) => {
  try {
    const { branchId, sem, division, date, fromDate, toDate, eventName, slots } = req.body;

    if (!branchId || !sem || !division || (!date && (!fromDate || !toDate)) || !slots || !Array.isArray(slots)) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    let targetDates = [];
    if (fromDate && toDate) {
      let current = tempService.normalizeDate(fromDate);
      const end = tempService.normalizeDate(toDate);
      if (!current || !end) {
        return res.status(400).json({ success: false, message: 'Invalid fromDate or toDate format' });
      }
      while (current <= end) {
        targetDates.push(new Date(current));
        current.setUTCDate(current.getUTCDate() + 1);
      }
    } else {
      const parsedDate = tempService.normalizeDate(date);
      if (!parsedDate) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }
      targetDates.push(parsedDate);
    }

    const createdSlots = [];
    for (const targetDate of targetDates) {
      // Clear existing temporary slots for this date, branch, sem, division
      await prisma.temporaryTimeTable.deleteMany({
        where: {
          branch_id: parseInt(branchId, 10),
          semester: parseInt(sem, 10),
          division,
          date: targetDate,
        }
      });

      for (const slot of slots) {
        const { startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes, subjectCode, facultyId, roomNumber } = slot;
        
        const newSlot = await prisma.temporaryTimeTable.create({
          data: {
            branch_id: parseInt(branchId, 10),
            semester: parseInt(sem, 10),
            division,
            date: targetDate,
            startTimeHr: parseInt(startTimeHr, 10),
            startTimeMinutes: parseInt(startTimeMinutes, 10),
            endTimeHr: parseInt(endTimeHr, 10),
            endTimeMinutes: parseInt(endTimeMinutes, 10),
            subjectCode: subjectCode || null,
            facultyid: facultyId ? BigInt(facultyId) : null,
            room_number: roomNumber || null,
            eventName: eventName || null,
            typeOfLecture: 'Lecture',
            createdBy: req.user?.uid ? BigInt(req.user.uid) : null,
          }
        });
        createdSlots.push(newSlot);
      }
    }

    return res.status(201).json({ success: true, data: serialize(createdSlots) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  create,
  list,
  delete: remove,
  generate,
  downloadPdf,
  createBulk,
};
