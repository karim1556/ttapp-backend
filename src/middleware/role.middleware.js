// user_type: 1 = Admin, 2 = Faculty, 3 = Student

const requireAdmin = (req, res, next) => {
  if (req.user?.user_type !== 1) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const requireFaculty = (req, res, next) => {
  if (req.user?.user_type !== 2) {
    return res.status(403).json({ success: false, message: 'Faculty access required' });
  }
  next();
};

const requireAdminOrFaculty = (req, res, next) => {
  if (req.user?.user_type !== 1 && req.user?.user_type !== 2) {
    return res.status(403).json({ success: false, message: 'Admin or Faculty access required' });
  }
  next();
};

module.exports = { requireAdmin, requireFaculty, requireAdminOrFaculty };
