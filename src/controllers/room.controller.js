'use strict';
const prisma = require('../config/prisma');

// ── GET /api/rooms ───────────────────────────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const { branch_id } = req.query;
    const where = {};
    if (branch_id) where.branch_id = parseInt(branch_id);

    const rooms = await prisma.room.findMany({ where, orderBy: { room_number: 'asc' } });
    return res.json({ success: true, data: rooms });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/rooms/:id ───────────────────────────────────────────────────────
const getOne = async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    return res.json({ success: true, data: room });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/rooms ──────────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const { room_number, name, capacity, room_type, branch_id, floor, is_active } = req.body;
    if (!room_number) return res.status(400).json({ success: false, message: 'room_number is required' });

    const room = await prisma.room.create({
      data: {
        room_number,
        name:      name      || null,
        capacity:  capacity  ? parseInt(capacity)  : null,
        room_type: room_type || 'Classroom',
        branch_id: branch_id ? parseInt(branch_id) : null,
        floor:     floor     || null,
        is_active: is_active !== undefined ? parseInt(is_active) : 1,
      },
    });
    return res.status(201).json({ success: true, data: room });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/rooms/:id ───────────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { room_number, name, capacity, room_type, branch_id, floor, is_active } = req.body;

    const data = {};
    if (room_number !== undefined) data.room_number = room_number;
    if (name        !== undefined) data.name        = name;
    if (capacity    !== undefined) data.capacity    = capacity ? parseInt(capacity) : null;
    if (room_type   !== undefined) data.room_type   = room_type;
    if (branch_id   !== undefined) data.branch_id   = branch_id ? parseInt(branch_id) : null;
    if (floor       !== undefined) data.floor       = floor;
    if (is_active   !== undefined) data.is_active   = parseInt(is_active);

    const room = await prisma.room.update({ where: { id }, data });
    return res.json({ success: true, data: room });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/rooms/:id ────────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    await prisma.room.delete({ where: { id: parseInt(req.params.id) } });
    return res.json({ success: true, message: 'Room deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getOne, create, update, remove };
