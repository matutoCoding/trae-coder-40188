const transcriptModel = require('../models/transcriptModel');
const reviewModel = require('../models/reviewModel');
const taskModel = require('../models/taskModel');
const config = require('../config');

function getTranscriptDetail(transcriptId) {
  const transcript = transcriptModel.getTranscriptById(transcriptId);
  if (!transcript) return null;

  const sentences = transcriptModel.getSentences(transcriptId);
  const latestComments = reviewModel.getLatestCommentsByTranscript(transcriptId);

  const commentMap = new Map();
  for (const comment of latestComments) {
    commentMap.set(comment.sentenceId, comment);
  }

  const sentencesWithComments = sentences.map(sentence => ({
    ...sentence,
    latestReview: commentMap.get(sentence.id) || null
  }));

  const task = taskModel.getTaskById(transcript.taskId);

  const speakerGroups = {};
  for (const sentence of sentencesWithComments) {
    const speaker = sentence.speakerName;
    if (!speakerGroups[speaker]) {
      speakerGroups[speaker] = {
        speakerName: speaker,
        speakerIndex: sentence.speakerIndex,
        sentenceCount: 0,
        wordCount: 0
      };
    }
    speakerGroups[speaker].sentenceCount++;
    speakerGroups[speaker].wordCount += sentence.wordCount;
  }

  const sensitiveCount = sentences.filter(s => s.isSensitive).length;

  return {
    id: transcript.id,
    taskId: transcript.taskId,
    taskTitle: task ? task.title : null,
    sensitivityLevel: task ? task.sensitivityLevel : null,
    durationSeconds: transcript.durationSeconds,
    totalSentences: transcript.totalSentences,
    sensitiveSentenceCount: sensitiveCount,
    createdAt: transcript.createdAt,
    updatedAt: transcript.updatedAt,
    speakers: Object.values(speakerGroups),
    sentences: sentencesWithComments
  };
}

function getTranscriptByTaskId(taskId) {
  const transcript = transcriptModel.getTranscriptByTaskId(taskId);
  if (!transcript) return null;
  return getTranscriptDetail(transcript.id);
}

function getSentences(transcriptId, options = {}) {
  const sentences = transcriptModel.getSentences(transcriptId, options);
  const latestComments = reviewModel.getLatestCommentsByTranscript(transcriptId);

  const commentMap = new Map();
  for (const comment of latestComments) {
    commentMap.set(comment.sentenceId, comment);
  }

  return sentences.map(sentence => ({
    ...sentence,
    latestReview: commentMap.get(sentence.id) || null
  }));
}

function exportTranscript(transcriptId, format = 'json') {
  const detail = getTranscriptDetail(transcriptId);
  if (!detail) return null;

  if (format === 'text') {
    let text = `采访逐字稿\n`;
    text += `主题：${detail.taskTitle || '未知'}\n`;
    text += `时长：${formatDuration(detail.durationSeconds)}\n`;
    text += `生成时间：${formatDate(detail.createdAt)}\n`;
    text += `保密级别：${detail.sensitivityLevel}\n`;
    text += `\n${'='.repeat(50)}\n\n`;

    for (const sentence of detail.sentences) {
      const timeStr = formatTime(sentence.startTime);
      let marker = '';
      if (sentence.isSensitive) {
        marker = '【敏感】';
      }
      if (sentence.latestReview) {
        marker += `【${sentence.latestReview.actionType}】`;
      }
      text += `[${timeStr}] ${sentence.speakerName}${marker}：${sentence.content}\n\n`;
    }

    return {
      format: 'text',
      content: text,
      filename: `transcript_${transcriptId}.txt`
    };
  }

  return {
    format: 'json',
    content: detail,
    filename: `transcript_${transcriptId}.json`
  };
}

function formatDuration(seconds) {
  if (!seconds) return '0秒';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

module.exports = {
  getTranscriptDetail,
  getTranscriptByTaskId,
  getSentences,
  exportTranscript
};
