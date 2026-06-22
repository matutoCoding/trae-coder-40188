const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const taskModel = require('../models/taskModel');
const transcriptModel = require('../models/transcriptModel');
const { mockTranscribe } = require('./transcriptionService');
const config = require('../config');

const processingTasks = new Set();

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
    title: taskData.title,
    speakerNames: taskData.speakerNames || [],
    sensitivityLevel: taskData.sensitivityLevel || config.sensitivityLevels.INTERNAL,
    audioFilename,
    audioOriginalName,
    submittedBy: taskData.submittedBy || 'system'
  });

  startTranscription(task.id);

  return task;
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
  const audioPath = task.audioFilename
    ? path.join(config.uploadDir, task.audioFilename)
    : null;

  const speakerNames = task.speakerNames || [];

  const result = await mockTranscribe(audioPath, speakerNames);

  const transcript = transcriptModel.createTranscript(task.id, result.durationSeconds);

  transcriptModel.addSentences(transcript.id, result.sentences);

  return transcript;
}

function getTaskStatus(taskId) {
  const task = taskModel.getTaskById(taskId);
  if (!task) return null;

  const result = {
    id: task.id,
    title: task.title,
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

function retryTask(taskId) {
  const task = taskModel.getTaskById(taskId);
  if (!task) return null;

  if (task.status !== config.taskStatus.FAILED) {
    return task;
  }

  taskModel.updateTaskStatus(taskId, config.taskStatus.PENDING, { errorMessage: null });
  startTranscription(taskId);

  return getTaskStatus(taskId);
}

module.exports = {
  submitTask,
  getTaskStatus,
  getTaskList,
  retryTask
};
