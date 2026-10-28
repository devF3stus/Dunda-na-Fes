const { jobQueue } = require('../jobs/jobQueue');

function handleListJobs(req, res, next) {
  try {
    const items = jobQueue.listJobs();
    res.status(200).json({ items, total: items.length });
  } catch (err) {
    next(err);
  }
}

function handleGetJob(req, res, next) {
  try {
    const item = jobQueue.getJobById(req.params.id);
    res.status(200).json({ item });
  } catch (err) {
    next(err);
  }
}

function handleCreateJob(req, res, next) {
  try {
    const { stagedFileId, customName, modelName } = req.body || {};
    const job = jobQueue.enqueueJob({ stagedFileId, customName, modelName });
    res.status(201).json({ item: job });
  } catch (err) {
    next(err);
  }
}

function handleCancelJob(req, res, next) {
  try {
    const job = jobQueue.cancelJob(req.params.id);
    res.status(200).json({ item: job });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleListJobs,
  handleGetJob,
  handleCreateJob,
  handleCancelJob,
};
