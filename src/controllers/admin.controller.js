const prisma = require('../config/prisma');

// ── GET /api/admin/stats ─────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [totalTeachers, totalSubjects, totalTimetableDays, totalHolidays] =
      await Promise.all([
        prisma.faculty.count({ where: { status: 1 } }),
        prisma.subject.count(),
        prisma.tblTimeTable.count(),
        prisma.holiday.count(),
      ]);

    return res.json({
      success: true,
      data: {
        totalTeachers,
        totalSubjects,
        totalTimetableDays,
        totalHolidays,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getStats };
