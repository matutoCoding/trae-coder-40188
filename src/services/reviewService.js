const reviewModel = require('../models/reviewModel');
const transcriptModel = require('../models/transcriptModel');
const config = require('../config');

const validActions = Object.values(config.reviewActions);

function addComment(sentenceId, actionType, content, reviewer) {
  if (!validActions.includes(actionType)) {
    throw new Error(`无效的审核动作类型: ${actionType}，有效值: ${validActions.join(', ')}`);
  }

  const sentence = transcriptModel.getSentenceById(sentenceId);
  if (!sentence) {
    throw new Error('句子不存在');
  }

  const comment = reviewModel.addReviewComment(
    sentenceId,
    sentence.transcriptId,
    actionType,
    content,
    reviewer
  );

  return comment;
}

function getSentenceComments(sentenceId) {
  return reviewModel.getCommentsBySentence(sentenceId);
}

function getLatestComments(transcriptId) {
  return reviewModel.getLatestCommentsByTranscript(transcriptId);
}

function getVersionHistory(transcriptId) {
  const history = reviewModel.getVersionHistory(transcriptId);

  const groupedBySentence = {};
  for (const record of history) {
    if (!groupedBySentence[record.sentenceId]) {
      groupedBySentence[record.sentenceId] = {
        sentenceId: record.sentenceId,
        sentenceContent: record.sentenceContent,
        speakerName: record.speakerName,
        versions: []
      };
    }
    groupedBySentence[record.sentenceId].versions.push({
      commentId: record.commentId,
      actionType: record.actionType,
      content: record.content,
      reviewer: record.reviewer,
      createdAt: record.createdAt,
      version: record.version,
      isLatest: record.isLatest
    });
  }

  return {
    totalRecords: history.length,
    sentenceCount: Object.keys(groupedBySentence).length,
    changes: Object.values(groupedBySentence)
  };
}

function getTranscriptReviewSummary(transcriptId) {
  const comments = reviewModel.getLatestCommentsByTranscript(transcriptId);

  const summary = {
    totalReviewed: comments.length,
    byAction: {}
  };

  for (const action of validActions) {
    summary.byAction[action] = 0;
  }

  for (const comment of comments) {
    if (summary.byAction[comment.actionType] !== undefined) {
      summary.byAction[comment.actionType]++;
    }
  }

  return summary;
}

module.exports = {
  addComment,
  getSentenceComments,
  getLatestComments,
  getVersionHistory,
  getTranscriptReviewSummary,
  validActions
};
