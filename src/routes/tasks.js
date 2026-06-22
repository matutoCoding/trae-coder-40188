const express = require('express');
const multer = require('multer');
const path = require('path');

const taskService = require('../services/taskService');
const config = require('../config');
const { asyncHandler, validateRequired } = require('../middleware/common');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'tmp-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp3|wav|m4a|aac|flac|ogg|wma/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      cb(null, true);
    } else {
      cb(new Error('只支持音频文件: mp3, wav, m4a, aac, flac, ogg, wma'));
    }
  }
});

function handleUploadError(err, req, res, next) {
  if (err) {
    return res.status(400).json({
      error: '音频上传失败',
      reason: err.message || '未知错误'
    });
  }
  next();
}

router.post('/', (req, res, next) => {
  upload.single('audio')(req, res, (err) => handleUploadError(err, req, res, next));
}, (req, res) => {
  try {
    const { title, speakerNames, sensitivityLevel, submittedBy } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: '音频文件为必填项，请上传音频文件（字段名: audio）' });
    }

    if (!title) {
      return res.status(400).json({ error: '缺少必填字段: title' });
    }

    if (!submittedBy) {
      return res.status(400).json({ error: '缺少必填字段: submittedBy' });
    }

    if (sensitivityLevel && !Object.values(config.sensitivityLevels).includes(sensitivityLevel)) {
      return res.status(400).json({
        error: `无效的保密级别，有效值: ${Object.values(config.sensitivityLevels).join(', ')}`
      });
    }

    let parsedSpeakerNames = [];
    if (speakerNames) {
      if (typeof speakerNames === 'string') {
        try {
          parsedSpeakerNames = JSON.parse(speakerNames);
        } catch (e) {
          parsedSpeakerNames = speakerNames.split(',').map(s => s.trim()).filter(s => s);
        }
      } else if (Array.isArray(speakerNames)) {
        parsedSpeakerNames = speakerNames;
      }
    }

    const task = taskService.submitTask({
      title,
      speakerNames: parsedSpeakerNames,
      sensitivityLevel,
      submittedBy
    }, req.file);

    res.status(201).json({
      message: '转写任务已提交',
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        sensitivityLevel: task.sensitivityLevel,
        createdAt: task.createdAt
      },
      statusUrl: `/api/tasks/${task.id}`
    });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: err.message || '创建任务失败' });
  }
});

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const status = taskService.getTaskStatus(id);

  if (!status) {
    return res.status(404).json({ error: '任务不存在' });
  }

  res.json(status);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { status, sensitivityLevel, submittedBy, page = 1, pageSize = 20 } = req.query;

  const filters = {};
  if (status) filters.status = status;
  if (sensitivityLevel) filters.sensitivityLevel = sensitivityLevel;
  if (submittedBy) filters.submittedBy = submittedBy;

  const result = taskService.getTaskList(
    filters,
    parseInt(page),
    parseInt(pageSize)
  );

  res.json(result);
}));

router.post('/:id/retry', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = taskService.retryTask(id);

  if (!result) {
    return res.status(404).json({ error: '任务不存在' });
  }

  res.json({
    message: '任务已重新提交',
    task: result
  });
}));

module.exports = router;
