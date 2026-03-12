const prisma = require('../config/prisma');

// ── GET /api/constraints/:facultyId ─────────────────────────────────────────
const getByFacultyId = async (req, res) => {
  try {
    const facultyId = parseInt(req.params.facultyId);

    const constraint = await prisma.facultyConstraint.findUnique({
      where: { faculty_id: facultyId },
    });

    if (!constraint) {
      // Return defaults so the Flutter UI can still render
      return res.json({
        success: true,
        data: {
          id: null,
          faculty_id:              facultyId,
          max_lectures_per_day:    4,
          total_lectures_per_week: 16,
          unavailable_slots:       [],
          preferred_slots:         [],
        },
      });
    }

    return res.json({ success: true, data: constraint });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/constraints ────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const {
      faculty_id, max_lectures_per_day,
      total_lectures_per_week, unavailable_slots, preferred_slots,
    } = req.body;

    if (!faculty_id) {
      return res.status(400).json({ success: false, message: 'faculty_id is required' });
    }

    const constraint = await prisma.facultyConstraint.create({
      data: {
        faculty_id:              parseInt(faculty_id),
        max_lectures_per_day:    max_lectures_per_day    ? parseInt(max_lectures_per_day)    : 4,
        total_lectures_per_week: total_lectures_per_week ? parseInt(total_lectures_per_week) : 16,
        unavailable_slots:       unavailable_slots || [],
        preferred_slots:         preferred_slots   || [],
      },
    });

    return res.status(201).json({ success: true, data: constraint });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/constraints/:id ─────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      max_lectures_per_day, total_lectures_per_week,
      unavailable_slots, preferred_slots,
    } = req.body;

    const data = {};
    if (max_lectures_per_day    !== undefined) data.max_lectures_per_day    = parseInt(max_lectures_per_day);
    if (total_lectures_per_week !== undefined) data.total_lectures_per_week = parseInt(total_lectures_per_week);
    if (unavailable_slots       !== undefined) data.unavailable_slots       = unavailable_slots;
    if (preferred_slots         !== undefined) data.preferred_slots         = preferred_slots;

    const constraint = await prisma.facultyConstraint.update({ where: { id }, data });
    return res.json({ success: true, data: constraint });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getByFacultyId, create, update };
