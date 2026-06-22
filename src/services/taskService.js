const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const taskModel = require('../models/taskModel');
const transcriptModel = require('../models/transcriptModel');
const { mockTranscribe, validateAudioFile } = require('./transcriptionService');
const config = require('../config');

const processingTasks = new Set();

const ALLOWED_AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.wma'];

function isValidAudioExtension(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ALLOWED_AUDIO_EXT.includes(ext);
}

function submitTask(taskData, audioFile = null) {
  let audioFilename = null;
  let audioOriginalName = null;

  if (audioFile) {
    const ext = path.extname(audioFile.originalname);
    audioFilename = uuidv4() + ext;
    audioOriginalName = audioFile.originalname;

    const destPath = path.join(config.uploadDir, audioFilename);
    fs.renameSync(audioFile.path, destPath);
  }

  const task = taskModel.createTask({
    batchId: taskData.batchId || null,
    title: taskData.title,
    speakerNames: taskData.speakerNames || [],
    sensitivityLevel: taskData.sensitivityLevel || config.sensitivityLevels.INTERNAL,
    audioFilename,
    audioOriginalName,
    submittedBy: taskData.submittedBy || 'system'
  });

  if (!audioFilename) {
    taskModel.updateTaskStatus(task.id, config.taskStatus.FAILED, {
      errorMessage: '缺少音频文件'
    });
    return taskModel.getTaskById(task.id);
  }

  if (!isValidAudioExtension(audioOriginalName)) {
    taskModel.updateTaskStatus(task.id, config.taskStatus.FAILED, {
      errorMessage: `不支持的音频格式: ${path.extname(audioOriginalName) || '未知格式'}，支持格式: ${ALLOWED_AUDIO_EXT.join(', ')}`
    });
    return taskModel.getTaskById(task.id);
  }

  startTranscription(task.id);

  return taskModel.getTaskById(task.id);
}

function submitBatchTask(batchData, audioFiles = []) {
  const batchId = uuidv4();
  const tasks = [];
  const now = Date.now();

  audioFiles.forEach((file, index) => {
    const title = batchData.titleTemplate
      ? batchData.titleTemplate.replace('{index}', index + 1).replace('{filename}', file.originalname)
      : `${batchData.batchTitle || '批量任务'} - ${file.originalname}`;

    const task = submitTask({
      batchId,
      title,
      speakerNames: batchData.speakerNames || [],
      sensitivityLevel: batchData.sensitivityLevel || config.sensitivityLevels.INTERNAL,
      submittedBy: batchData.submittedBy || 'system'
    }, file);

    tasks.push(task);
  });

  return {
    batchId,
    totalCount: audioFiles.length,
    createdAt: now,
    submittedBy: batchData.submittedBy || 'system',
    tasks
  };
}

function startTranscription(taskId) {
  if (processingTasks.has(taskId)) return;

  const task = taskModel.getTaskById(taskId);
  if (!task) return;

  if (task.status !== config.taskStatus.PENDING) return;

  processingTasks.add(taskId);
  taskModel.updateTaskStatus(taskId, config.taskStatus.PROCESSING);

  processTranscription(task)
    .then(() => {
      taskModel.updateTaskStatus(taskId, config.taskStatus.COMPLETED);
    })
    .catch((err) => {
      console.error('Transcription failed for task', taskId, err);
      taskModel.updateTaskStatus(taskId, config.taskStatus.FAILED, {
        errorMessage: err.message || '转写失败'
      });
    })
    .finally(() => {
      processingTasks.delete(taskId);
    });
}

async function processTranscription(task) {
  if (!task.audioFilename) {
    throw new Error('缺少音频文件，无法进行转写');
  }

  const audioPath = path.join(config.uploadDir, task.audioFilename);

  if (!fs.existsSync(audioPath)) {
    throw new Error(`音频文件不存在: ${task.audioOriginalName || task.audioFilename}`);
  }

  const speakerNames = task.speakerNames || [];

  let result;
  try {
    result = await mockTranscribe(audioPath, speakerNames);
  } catch (err) {
    throw new Error(`转写服务处理失败: ${err.message}`);
  }

  if (!result || !result.sentences || result.sentences.length === 0) {
    throw new Error('转写结果为空，未能从音频中识别出有效内容');
  }

  const transcript = transcriptModel.createTranscript(task.id, result.durationSeconds);

  transcriptModel.addSentences(transcript.id, result.sentences);

  return transcript;
}

function getTaskStatus(taskId) {
  const task = taskModel.getTaskById(taskId);
  if (!task) return null;

  const result = {
    id: task.id,
    batchId: task.batchId,
    title: task.title,
    audioOriginalName: task.audioOriginalName,
    status: task.status,
    sensitivityLevel: task.sensitivityLevel,
    submittedBy: task.submittedBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt
  };

  if (task.status === config.taskStatus.COMPLETED) {
    const transcript = transcriptModel.getTranscriptByTaskId(task.id);
    if (transcript) {
      result.transcriptId = transcript.id;
      result.transcriptUrl = `/api/transcripts/${transcript.id}`;
      result.totalSentences = transcript.totalSentences;
      result.durationSeconds = transcript.durationSeconds;
    }
  }

  if (task.status === config.taskStatus.FAILED) {
    result.errorMessage = task.errorMessage;
  }

  return result;
}

function getTaskList(filters, page, pageSize) {
  return taskModel.getTaskList(filters, page, pageSize);
}

function getBatchTasks(batchId, page = 1, pageSize = 50) {
  const result = taskModel.getTaskList({ batchId }, page, pageSize);

  const tasks = result.list;
  let completed = 0;
  let failed = 0;
  let processing = 0;
  let pending = 0;

  tasks.forEach(t => {
    switch (t.status) {
      case config.taskStatus.COMPLETED: completed++; break;
      case config.taskStatus.FAILED: failed++; break;
      case config.taskStatus.PROCESSING: processing++; break;
      case config.taskStatus.PENDING: pending++; break;
    }
  });

  const firstTask = tasks.length > 0 ? tasks[0] : null;

  return {
    batchId,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    submittedBy: firstTask ? firstTask.submittedBy : null,
    createdAt: firstTask ? firstTask.createdAt : null,
    stats: {
      completed,
      failed,
      processing,
      pending
    },
    tasks
  };
}

function retryBatchTasks(batchId) {
  const result = taskModel.getTaskList({ batchId, status: config.taskStatus.FAILED }, 1, 1000);
  const retried = [];

  result.list.forEach(task => {
    retryTask(task.id);
    retried.push(task.id);
  });

  return {
    batchId,
    retriedCount: retried.length,
    retriedTaskIds: retried
  };
}

function retryTask(taskId) {
  const task = taskModel.getTaskById(taskId);
  if (!task) return null;

  if (task.status !== config.taskStatus.FAILED) {
    return getTaskStatus(taskId);
  }

  if (!task.audioFilename || !isValidAudioExtension(task.audioOriginalName)) {
    return getTaskStatus(taskId);
  }

  taskModel.updateTaskStatus(taskId, config.taskStatus.PENDING, { errorMessage: null });
  startTranscription(taskId);

  return getTaskStatus(taskId);
}

module.exports = {
  submitTask,
  submitBatchTask,
  getTaskStatus,
  getTaskList,
  getBatchTasks,
  retryTask,
  retryBatchTasks
};
