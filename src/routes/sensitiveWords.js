const express = require('express');
const sensitiveWordModel = require('../models/sensitiveWordModel');
const config = require('../config');
const { asyncHandler } = require('../middleware/common');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { category, includeInactive } = req.query;

  let words;
  if (category) {
    words = sensitiveWordModel.getSensitiveWordsByCategory(category);
  } else {
    words = sensitiveWordModel.getAllSensitiveWords(includeInactive !== 'true');
  }

  res.json({
    total: words.length,
    categories: Object.values(config.sensitiveCategories),
    words
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { word, category, description } = req.body;

  if (!word) {
    return res.status(400).json({ error: '缺少必填字段: word' });
  }

  if (!category) {
    return res.status(400).json({ error: '缺少必填字段: category' });
  }

  const validCategories = Object.values(config.sensitiveCategories);
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      error: `无效的类别，有效值: ${validCategories.join(', ')}`
    });
  }

  const result = sensitiveWordModel.addSensitiveWord(word, category, description || '');

  if (!result) {
    return res.status(409).json({ error: '该敏感词已存在' });
  }

  res.status(201).json({
    message: '敏感词已添加',
    word: result
  });
}));

router.put('/:id/toggle', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  const success = sensitiveWordModel.toggleSensitiveWord(id, isActive !== false);

  if (!success) {
    return res.status(404).json({ error: '敏感词不存在' });
  }

  res.json({ message: '状态已更新' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const success = sensitiveWordModel.deleteSensitiveWord(id);

  if (!success) {
    return res.status(404).json({ error: '敏感词不存在' });
  }

  res.json({ message: '敏感词已删除' });
}));

router.post('/detect', asyncHandler(async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: '缺少必填字段: text' });
  }

  const result = sensitiveWordModel.detectSensitiveContent(text);
  res.json(result);
}));

module.exports = router;
