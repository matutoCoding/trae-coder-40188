const express = require('express');
const transcriptService = require('../services/transcriptService');
const reviewService = require('../services/reviewService');
const { asyncHandler } = require('../middleware/common');

const router = express.Router();

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
  const { onlySensitive, speakerName } = req.query;

  const options = {};
  if (onlySensitive === 'true' || onlySensitive === '1') {
    options.onlySensitive = true;
  }
  if (speakerName) {
    options.speakerName = speakerName;
  }

  const sentences = transcriptService.getSentences(id, options);
  res.json({
    total: sentences.length,
    sentences
  });
}));

router.get('/:id/export', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { format = 'json' } = req.query;

  const result = transcriptService.exportTranscript(id, format);

  if (!result) {
    return res.status(404).json({ error: '逐字稿不存在' });
  }

  if (format === 'text') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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
