const prisma = require('../config/prisma');

// ── POST /api/notifications/token ────────────────────────────────────────────
const saveToken = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.uid;

    if (!token) {
      return res.status(400).json({ success: false, message: 'FCM token is required' });
    }

    await prisma.fcmToken.upsert({
      where:  { user_id: userId },
      update: { token },
      create: { user_id: userId, token },
    });

    return res.json({ success: true, message: 'FCM token saved' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { saveToken };
