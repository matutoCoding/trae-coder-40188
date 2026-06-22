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

  let result = sentences.map(sentence => ({
    ...sentence,
    latestReview: commentMap.get(sentence.id) || null
  }));

  if (options.reviewStatus) {
    const status = options.reviewStatus;
    if (status === 'has_review') {
      result = result.filter(s => s.latestReview !== null);
    } else if (status === 'no_review') {
      result = result.filter(s => s.latestReview === null);
    } else {
      result = result.filter(s =>
        s.latestReview !== null && s.latestReview.actionType === status
      );
    }
  }

  return result;
}

function exportTranscript(transcriptId, format = 'json', options = {}) {
  const detail = getTranscriptDetail(transcriptId);
  if (!detail) return null;

  let filteredSentences = detail.sentences;
  if (options.onlySensitive) {
    filteredSentences = filteredSentences.filter(s => s.isSensitive);
  }
  if (options.speakerName) {
    filteredSentences = filteredSentences.filter(s => s.speakerName === options.speakerName);
  }
  if (options.sensitiveCategory) {
    const cats = Array.isArray(options.sensitiveCategory)
      ? options.sensitiveCategory
      : [options.sensitiveCategory];
    filteredSentences = filteredSentences.filter(s =>
      s.isSensitive && s.sensitiveCategories &&
      cats.some(c => s.sensitiveCategories.includes(c))
    );
  }
  if (options.reviewStatus) {
    const status = options.reviewStatus;
    if (status === 'has_review') {
      filteredSentences = filteredSentences.filter(s => s.latestReview !== null);
    } else if (status === 'no_review') {
      filteredSentences = filteredSentences.filter(s => s.latestReview === null);
    } else {
      filteredSentences = filteredSentences.filter(s =>
        s.latestReview !== null && s.latestReview.actionType === status
      );
    }
  }

  if (format === 'text') {
    let text = `采访逐字稿\n`;
    text += `主题：${detail.taskTitle || '未知'}\n`;
    text += `时长：${formatDuration(detail.durationSeconds)}\n`;
    text += `生成时间：${formatDate(detail.createdAt)}\n`;
    text += `保密级别：${detail.sensitivityLevel}\n`;
    text += `句子数量：${filteredSentences.length}\n`;
    text += `\n${'='.repeat(50)}\n\n`;

    for (const sentence of filteredSentences) {
      const timeStr = formatTime(sentence.startTime);
      let marker = '';
      if (sentence.isSensitive) {
        const catLabels = sentence.sensitiveCategories.join(',');
        marker = `【敏感:${catLabels}】`;
      }
      if (sentence.latestReview) {
        marker += `【${sentence.latestReview.actionType}】`;
      }
      text += `[${timeStr}] ${sentence.speakerName}${marker}：${sentence.content}\n`;
      if (sentence.isSensitive && sentence.matchedSensitiveWords.length > 0) {
        const matched = sentence.matchedSensitiveWords.map(w => w.word).join(', ');
        text += `          → 匹配敏感词: ${matched}\n`;
      }
      if (sentence.latestReview && sentence.latestReview.content) {
        text += `          → 审核意见(${sentence.latestReview.reviewer}): ${sentence.latestReview.content}\n`;
      }
      text += '\n';
    }

    return {
      format: 'text',
      content: text,
      filename: `transcript_${transcriptId}.txt`
    };
  }

  if (format === 'csv') {
    const headers = [
      '序号', '开始时间', '结束时间', '说话人', '说话人编号',
      '内容', '是否敏感', '敏感类别', '匹配敏感词', '词数',
      '是否已审核', '审核动作', '审核意见', '审核人', '审核时间'
    ];

    const rows = filteredSentences.map((s, idx) => [
      idx + 1,
      formatTime(s.startTime),
      formatTime(s.endTime),
      s.speakerName,
      s.speakerIndex,
      s.content,
      s.isSensitive ? '是' : '否',
      s.sensitiveCategories.join('|'),
      s.matchedSensitiveWords.map(w => w.word).join('|'),
      s.wordCount,
      s.latestReview ? '是' : '否',
      s.latestReview ? s.latestReview.actionType : '',
      s.latestReview && s.latestReview.content ? s.latestReview.content : '',
      s.latestReview ? s.latestReview.reviewer : '',
      s.latestReview ? formatDate(s.latestReview.createdAt) : ''
    ]);

    const csvLines = [
      headers.map(h => csvEscape(h)).join(','),
      ...rows.map(row => row.map(cell => csvEscape(String(cell))).join(','))
    ];

    const csvContent = '\ufeff' + csvLines.join('\n');

    return {
      format: 'csv',
      content: csvContent,
      filename: `transcript_${transcriptId}.csv`
    };
  }

  const exportDetail = {
    ...detail,
    totalExported: filteredSentences.length,
    sentences: filteredSentences
  };

  return {
    format: 'json',
    content: exportDetail,
    filename: `transcript_${transcriptId}.json`
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
