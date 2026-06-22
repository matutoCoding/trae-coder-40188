const express = require('express');
const multer = require('multer');
const path = require('path');

const taskService = require('../services/taskService');
const config = require('../config');
const { asyncHandler } = require('../middleware/common');

const router = express.Router();

const ALLOWED_AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.wma'];

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
  }
});

function parseSpeakerNames(speakerNamesRaw) {
  if (!speakerNamesRaw) return [];
  if (typeof speakerNamesRaw === 'string') {
    try {
      const parsed = JSON.parse(speakerNamesRaw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      return speakerNamesRaw.split(',').map(s => s.trim()).filter(s => s);
    }
  }
  if (Array.isArray(speakerNamesRaw)) return speakerNamesRaw;
  return [];
}

router.post('/', upload.single('audio'), (req, res) => {
  try {
    const { title, speakerNames, sensitivityLevel, submittedBy, batchId } = req.body;

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

    const parsedSpeakerNames = parseSpeakerNames(speakerNames);

    const task = taskService.submitTask({
      title,
      speakerNames: parsedSpeakerNames,
      sensitivityLevel,
      submittedBy,
      batchId: batchId || null
    }, req.file);

    res.status(201).json({
      message: task.status === config.taskStatus.FAILED
        ? '任务已创建，但校验失败'
        : '转写任务已提交',
      task: {
        id: task.id,
        batchId: task.batchId,
        title: task.title,
        audioOriginalName: task.audioOriginalName,
        status: task.status,
        sensitivityLevel: task.sensitivityLevel,
        createdAt: task.createdAt,
        errorMessage: task.errorMessage || null
      },
      statusUrl: `/api/tasks/${task.id}`
    });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: err.message || '创建任务失败' });
  }
});

router.post('/batch', upload.array('audios', 50), (req, res) => {
  try {
    const { batchTitle, titleTemplate, speakerNames, sensitivityLevel, submittedBy } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请上传至少一个音频文件（字段名: audios）' });
    }

    if (!submittedBy) {
      return res.status(400).json({ error: '缺少必填字段: submittedBy' });
    }

    if (sensitivityLevel && !Object.values(config.sensitivityLevels).includes(sensitivityLevel)) {
      return res.status(400).json({
        error: `无效的保密级别，有效值: ${Object.values(config.sensitivityLevels).join(', ')}`
      });
    }

    const parsedSpeakerNames = parseSpeakerNames(speakerNames);

    const result = taskService.submitBatchTask({
      batchTitle,
      titleTemplate,
      speakerNames: parsedSpeakerNames,
      sensitivityLevel,
      submittedBy
    }, req.files);

    const taskSummaries = result.tasks.map(t => ({
      id: t.id,
      title: t.title,
      audioOriginalName: t.audioOriginalName,
      status: t.status,
      errorMessage: t.errorMessage || null
    }));

    res.status(201).json({
      message: `批量任务已提交，共 ${result.totalCount} 个任务`,
      batchId: result.batchId,
      totalCount: result.totalCount,
      submittedBy: result.submittedBy,
      createdAt: result.createdAt,
      batchUrl: `/api/tasks/batch/${result.batchId}`,
      tasks: taskSummaries
    });
  } catch (err) {
    console.error('Batch create task error:', err);
    res.status(500).json({ error: err.message || '批量创建任务失败' });
  }
});

router.get('/batch/:batchId', asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const { page = 1, pageSize = 50 } = req.query;

  const result = taskService.getBatchTasks(
    batchId,
    parseInt(page),
    parseInt(pageSize)
  );

  if (result.total === 0) {
    return res.status(404).json({ error: '批次不存在或没有任务' });
  }

  res.json(result);
}));

router.post('/batch/:batchId/retry', asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const result = taskService.retryBatchTasks(batchId);

  if (result.retriedCount === 0) {
    return res.status(404).json({ error: '批次不存在或没有可重试的失败任务' });
  }

  res.json({
    message: `已重新提交 ${result.retriedCount} 个失败任务`,
    ...result
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const status = taskService.getTaskStatus(id);

  if (!status) {
    return res.status(404).json({ error: '任务不存在' });
  }

  res.json(status);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { status, batchId, sensitivityLevel, submittedBy, page = 1, pageSize = 20 } = req.query;

  const filters = {};
  if (status) filters.status = status;
  if (batchId) filters.batchId = batchId;
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
