const prisma = require('../config/prisma');

// ── GET /api/holidays ────────────────────────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const { acadYear } = req.query;
    const where = {};
    if (acadYear) where.academic_year = acadYear;

    const holidays = await prisma.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    return res.json({ success: true, data: holidays });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/holidays/upcoming ───────────────────────────────────────────────
const getUpcoming = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: today } },
      orderBy: { date: 'asc' },
      take: 20,
    });
    return res.json({ success: true, data: holidays });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/holidays ───────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const { date, name, type, description, academic_year } = req.body;

    if (!date || !name) {
      return res.status(400).json({ success: false, message: 'date and name are required' });
    }

    const holiday = await prisma.holiday.create({
      data: {
        date:          new Date(date),
        name,
        type:          type          || 'National',
        description:   description   || null,
        academic_year: academic_year || null,
      },
    });
    return res.status(201).json({ success: true, data: holiday });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/holidays/:id ────────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { date, name, type, description, academic_year } = req.body;

    const data = {};
    if (date          !== undefined) data.date          = new Date(date);
    if (name          !== undefined) data.name          = name;
    if (type          !== undefined) data.type          = type;
    if (description   !== undefined) data.description   = description;
    if (academic_year !== undefined) data.academic_year = academic_year;

    const holiday = await prisma.holiday.update({ where: { id }, data });
    return res.json({ success: true, data: holiday });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/holidays/:id ─────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    await prisma.holiday.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true, message: 'Holiday deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getUpcoming, create, update, remove };
