const { v4: uuidv4 } = require('uuid');
const { getDb, saveDatabase } = require('./database');

function createTranscript(taskId, durationSeconds = 0) {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  const transcript = {
    id,
    taskId,
    durationSeconds,
    totalSentences: 0,
    createdAt: now,
    updatedAt: now
  };

  db.transcripts[id] = transcript;
  saveDatabase();

  return getTranscriptById(id);
}

function getTranscriptById(id) {
  const db = getDb();
  const transcript = db.transcripts[id];

  if (!transcript) return null;

  return {
    id: transcript.id,
    taskId: transcript.taskId,
    durationSeconds: transcript.durationSeconds,
    totalSentences: transcript.totalSentences,
    createdAt: transcript.createdAt,
    updatedAt: transcript.updatedAt
  };
}

function getTranscriptByTaskId(taskId) {
  const db = getDb();
  const transcripts = Object.values(db.transcripts).filter(t => t.taskId === taskId);
  if (transcripts.length === 0) return null;
  return getTranscriptById(transcripts[0].id);
}

function addSentences(transcriptId, sentences) {
  const db = getDb();
  const now = Date.now();

  const sentenceList = Object.values(db.sentences).filter(s => s.transcriptId === transcriptId);
  const startOrder = sentenceList.length;

  sentences.forEach((s, idx) => {
    const id = uuidv4();
    const categories = s.sensitiveCategories || [];
    const matchedWords = s.matchedSensitiveWords || [];
    const wordCount = s.content ? s.content.split(/\s+/).filter(w => w.length > 0).length : 0;

    db.sentences[id] = {
      id,
      transcriptId,
      speakerName: s.speakerName,
      speakerIndex: s.speakerIndex,
      startTime: s.startTime,
      endTime: s.endTime,
      content: s.content,
      wordCount,
      isSensitive: categories.length > 0,
      sensitiveCategories: categories,
      matchedSensitiveWords: matchedWords,
      sortOrder: startOrder + idx,
      createdAt: now,
      updatedAt: now
    };
  });

  const totalCount = Object.values(db.sentences).filter(s => s.transcriptId === transcriptId).length;

  const transcript = db.transcripts[transcriptId];
  if (transcript) {
    transcript.totalSentences = totalCount;
    transcript.updatedAt = now;
  }

  saveDatabase();
  return totalCount;
}

function getSentences(transcriptId, options = {}) {
  const db = getDb();
  let sentences = Object.values(db.sentences).filter(s => s.transcriptId === transcriptId);

  if (options.onlySensitive) {
    sentences = sentences.filter(s => s.isSensitive);
  }

  if (options.speakerName) {
    sentences = sentences.filter(s => s.speakerName === options.speakerName);
  }

  sentences.sort((a, b) => a.sortOrder - b.sortOrder);

  return sentences.map(row => ({
    id: row.id,
    transcriptId: row.transcriptId,
    speakerName: row.speakerName,
    speakerIndex: row.speakerIndex,
    startTime: row.startTime,
    endTime: row.endTime,
    content: row.content,
    wordCount: row.wordCount,
    isSensitive: row.isSensitive,
    sensitiveCategories: row.sensitiveCategories || [],
    matchedSensitiveWords: row.matchedSensitiveWords || [],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

function getSentenceById(sentenceId) {
  const db = getDb();
  const row = db.sentences[sentenceId];

  if (!row) return null;

  return {
    id: row.id,
    transcriptId: row.transcriptId,
    speakerName: row.speakerName,
    speakerIndex: row.speakerIndex,
    startTime: row.startTime,
    endTime: row.endTime,
    content: row.content,
    wordCount: row.wordCount,
    isSensitive: row.isSensitive,
    sensitiveCategories: row.sensitiveCategories || [],
    matchedSensitiveWords: row.matchedSensitiveWords || [],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

module.exports = {
  createTranscript,
  getTranscriptById,
  getTranscriptByTaskId,
  addSentences,
  getSentences,
  getSentenceById
};
