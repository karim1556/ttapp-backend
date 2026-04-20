const substitutionService = require('../services/substitution.service');

const getAll = async (req, res) => {
  try {
    const data = await substitutionService.listSubstitutions({
      requester: req.user,
      query: req.query,
    });

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
};

const preview = async (req, res) => {
  try {
    const candidates = await substitutionService.previewCandidates({
      requester: req.user,
      payload: req.body,
    });

    return res.json({ success: true, data: candidates });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
};

const create = async (req, res) => {
  try {
    const data = await substitutionService.createSubstitution({
      requester: req.user,
      payload: req.body,
    });

    return res.status(201).json({
      success: true,
      message: 'Substitution saved successfully',
      data,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
};

const approve = async (req, res) => {
  try {
    const data = await substitutionService.approveSubstitution({
      requester: req.user,
      substitutionId: req.params.id,
      payload: req.body,
    });

    return res.json({
      success: true,
      message: 'Substitution approved',
      data,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  getAll,
  preview,
  create,
  approve,
};
