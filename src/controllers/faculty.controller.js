const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');

// ── GET /api/faculty ────────────────────────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const { branchId, departId, status } = req.query;
    const where = {};
    if (branchId) where.branch_id = parseInt(branchId);
    if (departId) where.depart_id = parseInt(departId);
    if (status !== undefined) where.status = parseInt(status);

    const faculty = await prisma.faculty.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return res.json({ success: true, data: faculty });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/faculty ────────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const {
      name, email, contact, role, qualification,
      branch_id, depart_id, gender, status,
      faculty_clg_id, ftype_id, previlage, joining_date, shift_id,
      dob, pan_no, aadhar_card, blood_group,
      permanent_address, current_address, alternate_mobile,
      experience_details,
      weeklyWorkHours,
      weekly_work_hours,
    } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required to create a teacher login.' });
    }

    // Check if a login already exists for this email
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: `A user with email ${email} already exists.` });
    }

    // Default password = first part of email before @  e.g. "john.doe" from john.doe@college.com
    const defaultPassword = email.split('@')[0];
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Create user first, then faculty with uid link
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        user_type: 2, // Faculty
      },
    });

    const faculty = await prisma.faculty.create({
      data: {
        uid:                user.uid,
        name:               name || null,
        email:              email || null,
        contact:            contact || null,
        role:               role || null,
        qualification:      qualification || null,
        branch_id:          branch_id ? parseInt(branch_id) : null,
        weekly_work_hours:  (weeklyWorkHours ?? weekly_work_hours) !== undefined
          && (weeklyWorkHours ?? weekly_work_hours) !== null
          && (weeklyWorkHours ?? weekly_work_hours) !== ''
          ? parseInt(weeklyWorkHours ?? weekly_work_hours, 10)
          : 18,
        depart_id:          depart_id ? parseInt(depart_id) : null,
        gender:             gender || null,
        status:             status !== undefined ? parseInt(status) : 1,
        faculty_clg_id:     faculty_clg_id || null,
        ftype_id:           ftype_id ? parseInt(ftype_id) : null,
        previlage:          previlage ? parseInt(previlage) : null,
        joining_date:       joining_date ? new Date(joining_date) : null,
        shift_id:           shift_id ? parseInt(shift_id) : null,
        dob:                dob ? new Date(dob) : null,
        pan_no:             pan_no || null,
        aadhar_card:        aadhar_card || null,
        blood_group:        blood_group || null,
        permanent_address:  permanent_address || null,
        current_address:    current_address || null,
        alternate_mobile:   alternate_mobile || null,
        experience_details: experience_details || null,
      },
    });

    return res.status(201).json({
      success: true,
      data: faculty,
      credentials: {
        email,
        defaultPassword,
        note: 'Share these credentials with the teacher. They should change their password after first login.',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/faculty/:id ─────────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const raw = { ...req.body };

    // Never update PK or uid via this endpoint
    delete raw.faculty_id;
    delete raw.uid;

    // Sanitize typed fields
    const data = {};
    const strFields = ['name','email','contact','role','qualification','faculty_clg_id',
                       'gender','pan_no','aadhar_card','blood_group','permanent_address',
                       'current_address','alternate_mobile','experience_details',
                       'photo','signature','cv'];
    for (const f of strFields) {
      if (raw[f] !== undefined) data[f] = raw[f] || null;
    }
    if (raw.branch_id  !== undefined) data.branch_id  = raw.branch_id  ? parseInt(raw.branch_id)  : null;
    if (raw.depart_id  !== undefined) data.depart_id  = raw.depart_id  ? parseInt(raw.depart_id)  : null;
    if (raw.ftype_id   !== undefined) data.ftype_id   = raw.ftype_id   ? parseInt(raw.ftype_id)   : null;
    if (raw.shift_id   !== undefined) data.shift_id   = raw.shift_id   ? parseInt(raw.shift_id)   : null;
    if (raw.previlage  !== undefined) data.previlage  = raw.previlage  ? parseInt(raw.previlage)  : null;
    if (raw.status     !== undefined) data.status     = raw.status     !== null ? parseInt(raw.status) : 1;
    const weeklyHoursRaw = raw.weeklyWorkHours ?? raw.weekly_work_hours;
    if (weeklyHoursRaw !== undefined) {
      data.weekly_work_hours = weeklyHoursRaw === null || weeklyHoursRaw === ''
        ? null
        : parseInt(weeklyHoursRaw, 10);
    }
    if (raw.joining_date !== undefined) data.joining_date = raw.joining_date ? new Date(raw.joining_date) : null;
    if (raw.dob          !== undefined) data.dob          = raw.dob          ? new Date(raw.dob)          : null;

    const faculty = await prisma.faculty.update({ where: { faculty_id: id }, data });
    return res.json({ success: true, data: faculty });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/faculty/:id ──────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Fetch the faculty row so we know the linked uid
    const faculty = await prisma.faculty.findUnique({ where: { faculty_id: id } });
    if (!faculty) {
      return res.status(404).json({ success: false, message: 'Faculty not found' });
    }

    // Delete child records first to avoid FK constraint errors
    await prisma.facultyConstraint.deleteMany({ where: { faculty_id: id } });

    // Delete the faculty row
    await prisma.faculty.delete({ where: { faculty_id: id } });

    // Delete the linked user account (if exists)
    if (faculty.uid) {
      await prisma.user.deleteMany({ where: { uid: faculty.uid } });
    }

    return res.json({ success: true, message: 'Faculty deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/faculty/me ─────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const faculty = await prisma.faculty.findFirst({
      where: { uid: req.user.uid },
    });

    if (!faculty) {
      return res.status(404).json({ success: false, message: 'Faculty profile not found' });
    }

    return res.json({ success: true, data: faculty });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/faculty/me/work-hours ──────────────────────────────────────────
const updateMyWeeklyWorkHours = async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const weeklyHoursRaw = req.body.weeklyWorkHours ?? req.body.weekly_work_hours;
    const weeklyHours = parseInt(weeklyHoursRaw, 10);

    if (!Number.isFinite(weeklyHours) || weeklyHours < 1 || weeklyHours > 60) {
      return res.status(400).json({
        success: false,
        message: 'weeklyWorkHours must be a number between 1 and 60',
      });
    }

    const faculty = await prisma.faculty.findFirst({
      where: { uid: req.user.uid },
      select: { faculty_id: true },
    });

    if (!faculty) {
      return res.status(404).json({ success: false, message: 'Faculty profile not found' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const facultyRow = await tx.faculty.update({
        where: { faculty_id: faculty.faculty_id },
        data: { weekly_work_hours: weeklyHours },
      });

      // Keep scheduler weekly limit aligned with teacher-entered weekly workload.
      await tx.facultyConstraint.upsert({
        where: { faculty_id: faculty.faculty_id },
        update: { total_lectures_per_week: weeklyHours },
        create: {
          faculty_id: faculty.faculty_id,
          total_lectures_per_week: weeklyHours,
          max_lectures_per_day: 4,
          unavailable_slots: [],
          preferred_slots: [],
        },
      });

      return facultyRow;
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAll,
  create,
  update,
  remove,
  getMe,
  updateMyWeeklyWorkHours,
};
