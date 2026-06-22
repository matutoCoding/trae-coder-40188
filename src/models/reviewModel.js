const { v4: uuidv4 } = require('uuid');
const { getDb, saveDatabase } = require('./database');

function addReviewComment(sentenceId, transcriptId, actionType, content, reviewer) {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  const existingComments = Object.values(db.reviewComments).filter(c => c.sentenceId === sentenceId);
  const maxVersion = existingComments.length > 0
    ? Math.max(...existingComments.map(c => c.version))
    : 0;
  const nextVersion = maxVersion + 1;

  existingComments.forEach(c => {
    if (c.isLatest) {
      c.isLatest = false;
    }
  });

  const comment = {
    id,
    sentenceId,
    transcriptId,
    actionType,
    content: content || null,
    reviewer,
    createdAt: now,
    updatedAt: now,
    isLatest: true,
    version: nextVersion
  };

  db.reviewComments[id] = comment;
  saveDatabase();

  return getCommentById(id);
}

function getCommentById(id) {
  const db = getDb();
  const row = db.reviewComments[id];

  if (!row) return null;

  return {
    id: row.id,
    sentenceId: row.sentenceId,
    transcriptId: row.transcriptId,
    actionType: row.actionType,
    content: row.content,
    reviewer: row.reviewer,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isLatest: row.isLatest,
    version: row.version
  };
}

function getLatestCommentsByTranscript(transcriptId) {
  const db = getDb();
  const comments = Object.values(db.reviewComments)
    .filter(c => c.transcriptId === transcriptId && c.isLatest)
    .sort((a, b) => b.createdAt - a.createdAt);

  return comments.map(row => ({
    id: row.id,
    sentenceId: row.sentenceId,
    transcriptId: row.transcriptId,
    actionType: row.actionType,
    content: row.content,
    reviewer: row.reviewer,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isLatest: row.isLatest,
    version: row.version
  }));
}

function getCommentsBySentence(sentenceId) {
  const db = getDb();
  const comments = Object.values(db.reviewComments)
    .filter(c => c.sentenceId === sentenceId)
    .sort((a, b) => b.version - a.version);

  return comments.map(row => ({
    id: row.id,
    sentenceId: row.sentenceId,
    transcriptId: row.transcriptId,
    actionType: row.actionType,
    content: row.content,
    reviewer: row.reviewer,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isLatest: row.isLatest,
    version: row.version
  }));
}

function getVersionHistory(transcriptId) {
  const db = getDb();

  const comments = Object.values(db.reviewComments)
    .filter(c => c.transcriptId === transcriptId)
    .sort((a, b) => b.createdAt - a.createdAt);

  return comments.map(row => {
    const sentence = db.sentences[row.sentenceId];
    return {
      commentId: row.id,
      sentenceId: row.sentenceId,
      sentenceContent: sentence ? sentence.content : null,
      speakerName: sentence ? sentence.speakerName : null,
      actionType: row.actionType,
      content: row.content,
      reviewer: row.reviewer,
      createdAt: row.createdAt,
      version: row.version,
      isLatest: row.isLatest
    };
  });
}

module.exports = {
  addReviewComment,
  getCommentById,
  getLatestCommentsByTranscript,
  getCommentsBySentence,
  getVersionHistory
};
