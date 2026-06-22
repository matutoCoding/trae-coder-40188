const express = require('express');
const reviewService = require('../services/reviewService');
const { asyncHandler, validateRequired } = require('../middleware/common');

const router = express.Router();

router.post('/sentences/:sentenceId/comments', asyncHandler(async (req, res) => {
  const { sentenceId } = req.params;
  const { actionType, content, reviewer } = req.body;

  if (!actionType) {
    return res.status(400).json({ error: '缺少必填字段: actionType' });
  }

  if (!reviewer) {
    return res.status(400).json({ error: '缺少必填字段: reviewer' });
  }

  try {
    const comment = reviewService.addComment(sentenceId, actionType, content, reviewer);
    res.status(201).json({
      message: '审核意见已添加',
      comment
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

router.get('/sentences/:sentenceId/comments', asyncHandler(async (req, res) => {
  const { sentenceId } = req.params;
  const comments = reviewService.getSentenceComments(sentenceId);

  res.json({
    total: comments.length,
    comments
  });
}));

router.get('/transcripts/:transcriptId/comments', asyncHandler(async (req, res) => {
  const { transcriptId } = req.params;
  const comments = reviewService.getLatestComments(transcriptId);

  res.json({
    total: comments.length,
    comments
  });
}));

router.get('/transcripts/:transcriptId/version-history', asyncHandler(async (req, res) => {
  const { transcriptId } = req.params;
  const history = reviewService.getVersionHistory(transcriptId);

  res.json(history);
}));

module.exports = router;
