const { v4: uuidv4 } = require('uuid');
const { getDb, saveDatabase } = require('./database');
const config = require('../config');

function createTask(taskData) {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  const task = {
    id,
    title: taskData.title,
    speakerNames: taskData.speakerNames || null,
    sensitivityLevel: taskData.sensitivityLevel || config.sensitivityLevels.INTERNAL,
    audioFilename: taskData.audioFilename || null,
    audioOriginalName: taskData.audioOriginalName || null,
    status: config.taskStatus.PENDING,
    submittedBy: taskData.submittedBy,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null
  };

  db.tasks[id] = task;
  saveDatabase();

  return getTaskById(id);
}

function getTaskById(id) {
  const db = getDb();
  const task = db.tasks[id];

  if (!task) return null;

  return {
    id: task.id,
    title: task.title,
    speakerNames: task.speakerNames || null,
    sensitivityLevel: task.sensitivityLevel,
    audioFilename: task.audioFilename,
    audioOriginalName: task.audioOriginalName,
    status: task.status,
    submittedBy: task.submittedBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    errorMessage: task.errorMessage
  };
}

function getTaskList(filters = {}, page = 1, pageSize = 20) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  let tasks = Object.values(db.tasks);

  if (filters.status) {
    tasks = tasks.filter(t => t.status === filters.status);
  }

  if (filters.sensitivityLevel) {
    tasks = tasks.filter(t => t.sensitivityLevel === filters.sensitivityLevel);
  }

  if (filters.submittedBy) {
    tasks = tasks.filter(t => t.submittedBy === filters.submittedBy);
  }

  tasks.sort((a, b) => b.createdAt - a.createdAt);

  const total = tasks.length;
  const paginated = tasks.slice(offset, offset + pageSize);

  const list = paginated.map(task => ({
    id: task.id,
    title: task.title,
    sensitivityLevel: task.sensitivityLevel,
    status: task.status,
    submittedBy: task.submittedBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt
  }));

  return {
    total,
    page,
    pageSize,
    list
  };
}

function updateTaskStatus(id, status, extraData = {}) {
  const db = getDb();
  const task = db.tasks[id];

  if (!task) return false;

  const now = Date.now();
  task.status = status;
  task.updatedAt = now;

  if (status === config.taskStatus.COMPLETED) {
    task.completedAt = now;
  }

  if (extraData.errorMessage !== undefined) {
    task.errorMessage = extraData.errorMessage;
  }

  saveDatabase();
  return true;
}

module.exports = {
  createTask,
  getTaskById,
  getTaskList,
  updateTaskStatus
};
