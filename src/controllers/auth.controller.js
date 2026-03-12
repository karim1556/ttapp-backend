const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const prisma  = require('../config/prisma');

// ── POST /api/auth/login ────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await prisma.user.findFirst({ where: { email } });
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { uid: user.uid, email: user.email, user_type: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    );

    return res.json({
      success: true,
      data: {
        token,
        user: { uid: user.uid, email: user.email, user_type: user.user_type },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/profile ────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      select: { uid: true, email: true, user_type: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let profile = { ...user };

    // Faculty: attach faculty record
    if (user.user_type === 2) {
      const faculty = await prisma.faculty.findFirst({ where: { uid: user.uid } });
      if (faculty) profile.faculty = faculty;
    }

    return res.json({ success: true, data: profile });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { login, getProfile };
