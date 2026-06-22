const express = require('express');
const transcriptService = require('../services/transcriptService');
const reviewService = require('../services/reviewService');
const { asyncHandler } = require('../middleware/common');

const router = express.Router();

function parseFilterOptions(query) {
  const options = {};

  if (query.onlySensitive === 'true' || query.onlySensitive === '1') {
    options.onlySensitive = true;
  }
  if (query.speakerName) {
    options.speakerName = query.speakerName;
  }
  if (query.sensitiveCategory) {
    options.sensitiveCategory = Array.isArray(query.sensitiveCategory)
      ? query.sensitiveCategory
      : [query.sensitiveCategory];
  }
  if (query.reviewStatus) {
    options.reviewStatus = query.reviewStatus;
  }

  return options;
}

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const detail = transcriptService.getTranscriptDetail(id);

  if (!detail) {
    return res.status(404).json({ error: '逐字稿不存在' });
  }

  res.json(detail);
}));

router.get('/task/:taskId', asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const detail = transcriptService.getTranscriptByTaskId(taskId);

  if (!detail) {
    return res.status(404).json({ error: '该任务暂无逐字稿' });
  }

  res.json(detail);
}));

router.get('/:id/sentences', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const options = parseFilterOptions(req.query);

  const sentences = transcriptService.getSentences(id, options);
  res.json({
    total: sentences.length,
    filter: options,
    sentences
  });
}));

router.get('/:id/export', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { format = 'json' } = req.query;
  const options = parseFilterOptions(req.query);

  const result = transcriptService.exportTranscript(id, format, options);

  if (!result) {
    return res.status(404).json({ error: '逐字稿不存在' });
  }

  if (format === 'text') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.send(result.content);
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.send(result.content);
  }

  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.json(result.content);
}));

router.get('/:id/review-summary', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const summary = reviewService.getTranscriptReviewSummary(id);
  res.json(summary);
}));

router.get('/:id/version-history', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const history = reviewService.getVersionHistory(id);
  res.json(history);
}));

module.exports = router;
