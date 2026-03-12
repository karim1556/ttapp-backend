'use strict';
const prisma = require('../config/prisma');

// ── GET /api/timeslots ───────────────────────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const slots = await prisma.timeSlotTemplate.findMany({
      orderBy: [{ sort_order: 'asc' }, { startTimeHr: 'asc' }, { startTimeMinutes: 'asc' }],
    });
    return res.json({ success: true, data: slots });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/timeslots ──────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const { label, startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes, is_break, sort_order, is_active } = req.body;
    if (startTimeHr === undefined || endTimeHr === undefined) {
      return res.status(400).json({ success: false, message: 'startTimeHr and endTimeHr are required' });
    }

    const slot = await prisma.timeSlotTemplate.create({
      data: {
        label:            label            || null,
        startTimeHr:      parseInt(startTimeHr),
        startTimeMinutes: startTimeMinutes ? parseInt(startTimeMinutes) : 0,
        endTimeHr:        parseInt(endTimeHr),
        endTimeMinutes:   endTimeMinutes   ? parseInt(endTimeMinutes)   : 0,
        is_break:         is_break         ? parseInt(is_break)         : 0,
        sort_order:       sort_order       ? parseInt(sort_order)       : 0,
        is_active:        is_active !== undefined ? parseInt(is_active) : 1,
      },
    });
    return res.status(201).json({ success: true, data: slot });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/timeslots/:id ───────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { label, startTimeHr, startTimeMinutes, endTimeHr, endTimeMinutes, is_break, sort_order, is_active } = req.body;

    const data = {};
    if (label            !== undefined) data.label            = label;
    if (startTimeHr      !== undefined) data.startTimeHr      = parseInt(startTimeHr);
    if (startTimeMinutes !== undefined) data.startTimeMinutes = parseInt(startTimeMinutes);
    if (endTimeHr        !== undefined) data.endTimeHr        = parseInt(endTimeHr);
    if (endTimeMinutes   !== undefined) data.endTimeMinutes   = parseInt(endTimeMinutes);
    if (is_break         !== undefined) data.is_break         = parseInt(is_break);
    if (sort_order       !== undefined) data.sort_order       = parseInt(sort_order);
    if (is_active        !== undefined) data.is_active        = parseInt(is_active);

    const slot = await prisma.timeSlotTemplate.update({ where: { id }, data });
    return res.json({ success: true, data: slot });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/timeslots/:id ────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    await prisma.timeSlotTemplate.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true, message: 'Time slot deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove };
