const prisma = require('../config/prisma');

// ── helpers ──────────────────────────────────────────────────────────────────
const toNum = (v) => (v === undefined || v === null ? v : Number(v));

// Enrich a CopoUserCourse row with subject name + enrolled count
const enrichRow = async (row) => {
  const subject = row.course_id
    ? await prisma.subject.findUnique({
        where: { id: row.course_id },
        select: { subject_name: true, subject_code: true },
      })
    : null;

  const enrolledCount = await prisma.copoUserCourseUsers.count({
    where: { usercourse_id: row.usercourse_id },
  });

  return {
    ...row,
    subject_name: subject?.subject_name ?? null,
    subject_code: subject?.subject_code ?? null,
    enrolled_count: enrolledCount,
  };
};

// ── GET /api/copo ────────────────────────────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const { branch, semester, academic_year } = req.query;
    const where = {};
    if (branch)        where.branch        = parseInt(branch);
    if (semester)      where.semester      = parseInt(semester);
    if (academic_year) where.academic_year = academic_year;

    const rows = await prisma.copoUserCourse.findMany({
      where,
      orderBy: [{ academic_year: 'desc' }, { semester: 'asc' }],
    });

    const enriched = await Promise.all(rows.map(enrichRow));
    return res.json({ success: true, data: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/copo/:id ────────────────────────────────────────────────────────
const getOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const row = await prisma.copoUserCourse.findUnique({
      where: { usercourse_id: id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.json({ success: true, data: await enrichRow(row) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/copo ───────────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const { course_id, semester, academic_year, branch, co_count } = req.body;

    if (!course_id) {
      return res
        .status(400)
        .json({ success: false, message: 'course_id is required' });
    }

    const row = await prisma.copoUserCourse.create({
      data: {
        course_id:     course_id    ? parseInt(course_id)    : null,
        semester:      semester     ? parseInt(semester)     : null,
        academic_year: academic_year ?? null,
        branch:        branch       ? parseInt(branch)       : null,
        co_count:      co_count     ? parseInt(co_count)     : 0,
        created_at:    new Date(),
      },
    });

    return res.status(201).json({ success: true, data: await enrichRow(row) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/copo/:id ────────────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { course_id, semester, academic_year, branch, co_count } = req.body;

    const data = {};
    if (course_id     !== undefined) data.course_id     = parseInt(course_id);
    if (semester      !== undefined) data.semester      = parseInt(semester);
    if (academic_year !== undefined) data.academic_year = academic_year;
    if (branch        !== undefined) data.branch        = parseInt(branch);
    if (co_count      !== undefined) data.co_count      = parseInt(co_count);

    const row = await prisma.copoUserCourse.update({
      where: { usercourse_id: id },
      data,
    });

    return res.json({ success: true, data: await enrichRow(row) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/copo/:id ─────────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // Cascade-remove enrolled users first
    await prisma.copoUserCourseUsers.deleteMany({
      where: { usercourse_id: id },
    });
    await prisma.copoUserCourse.delete({ where: { usercourse_id: id } });
    return res.json({ success: true, message: 'Course mapping deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/copo/:id/users ──────────────────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const enrollments = await prisma.copoUserCourseUsers.findMany({
      where: { usercourse_id: id },
    });

    // Attach user email/type from users table
    const enriched = await Promise.all(
      enrollments.map(async (e) => {
        const user = await prisma.user.findUnique({
          where: { uid: e.user_id },
          select: { uid: true, email: true, user_type: true },
        });
        return { ...e, user };
      }),
    );

    return res.json({ success: true, data: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/copo/:id/users ─────────────────────────────────────────────────
// Body: { user_ids: [1, 2, 3] }
const addUsers = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { user_ids } = req.body;

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'user_ids array is required' });
    }

    // Avoid duplicate enrollments
    const existing = await prisma.copoUserCourseUsers.findMany({
      where: { usercourse_id: id },
      select: { user_id: true },
    });
    const existingIds = new Set(existing.map((e) => e.user_id));
    const toAdd = user_ids
      .map((uid) => parseInt(uid))
      .filter((uid) => !existingIds.has(uid));

    if (toAdd.length > 0) {
      await prisma.copoUserCourseUsers.createMany({
        data: toAdd.map((uid) => ({ usercourse_id: id, user_id: uid })),
      });
    }

    return res.json({
      success: true,
      message: `${toAdd.length} user(s) enrolled`,
      skipped: user_ids.length - toAdd.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/copo/:id/users/:userId ───────────────────────────────────────
const removeUser = async (req, res) => {
  try {
    const id     = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    await prisma.copoUserCourseUsers.deleteMany({
      where: { usercourse_id: id, user_id: userId },
    });

    return res.json({ success: true, message: 'User removed from course' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getOne, create, update, remove, getUsers, addUsers, removeUser };
