const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { detectSensitiveContent } = require('../models/sensitiveWordModel');

const INTERVIEW_TEMPLATES = [
  [
    { speakerIdx: 0, text: '各位好，今天我们很高兴邀请到公司CEO来分享最新的战略规划。首先请您谈谈今年整体的发展目标。', delay: 0 },
    { speakerIdx: 1, text: '感谢邀请。今年我们的营收目标是增长30%，收入约五十亿，利润率12.5%左右，其中新产品线的预算5000万。', delay: 4 },
    { speakerIdx: 0, text: '五十亿的目标很有挑战性，能具体说说产品X在其中扮演的角色吗？', delay: 9 },
    { speakerIdx: 1, text: '产品X作为我们的下一代产品，目前还属于未公开状态，客户A已经在做内部测试了。', delay: 14 },
    { speakerIdx: 0, text: '那Project Alpha项目呢？市场上有很多传闻。', delay: 19 },
    { speakerIdx: 1, text: 'Project Alpha是我们和战略客户合作的保密项目，具体细节暂时不能对外公布。', delay: 23 },
    { speakerIdx: 0, text: '明白了。在财务方面，净利润和毛利率预期如何？', delay: 28 },
    { speakerIdx: 1, text: '预期净利润增长35%，毛利率维持在45%左右，市场份额有望提升3个百分点。', delay: 32 },
    { speakerIdx: 0, text: '非常感谢您的分享，期待公司取得更好的成绩。', delay: 38 },
    { speakerIdx: 1, text: '谢谢，也感谢大家的关注。', delay: 42 }
  ],
  [
    { speakerIdx: 0, text: '欢迎参加本次季度财报采访，先请CFO介绍一下Q3的业绩情况。', delay: 0 },
    { speakerIdx: 1, text: '好的，Q3我们的营收达到8.5亿，同比增长25%，净利润1.2亿，净利率14.1%。', delay: 4 },
    { speakerIdx: 0, text: '增长非常不错，主要驱动力来自哪些方面？', delay: 9 },
    { speakerIdx: 1, text: '主要是企业服务业务，客户B和客户A的订单贡献很大，合计贡献约3亿收入。', delay: 13 },
    { speakerIdx: 0, text: '关于明年的预算安排，有什么可以透露的吗？', delay: 18 },
    { speakerIdx: 1, text: '明年研发预算将增加到8000万，重点投入产品X和下一代产品的研发。', delay: 22 },
    { speakerIdx: 0, text: '毛利率方面有什么预期？', delay: 27 },
    { speakerIdx: 1, text: '整体毛利率预计维持42%到44%之间，随着高毛利产品占比提升，还有增长空间。', delay: 30 },
    { speakerIdx: 0, text: '好的，非常感谢您的介绍。', delay: 35 },
    { speakerIdx: 1, text: '谢谢大家。', delay: 38 }
  ],
  [
    { speakerIdx: 0, text: '今天很荣幸请到CTO来谈谈技术战略。首先想了解公司在AI方面的布局。', delay: 0 },
    { speakerIdx: 1, text: '我们在AI领域已经投入了三年，Project Alpha项目就是这方面的成果，目前产品X已经集成了相关能力。', delay: 4 },
    { speakerIdx: 0, text: '听起来进展很快，投入了多少资源？', delay: 9 },
    { speakerIdx: 1, text: '这部分属于保密信息，不便透露具体数字。不过可以说AI团队现在有200人，占研发总人数30%。', delay: 13 },
    { speakerIdx: 0, text: '市场份额方面，公司在行业内处于什么位置？', delay: 18 },
    { speakerIdx: 1, text: '目前我们的市场份额约28%，排名第二，和第一名的差距正在缩小，目标明年达到35%。', delay: 22 },
    { speakerIdx: 0, text: '客户层面，有什么新的突破吗？', delay: 27 },
    { speakerIdx: 1, text: '客户A和战略客户的合作正在深化，本季度新增了5家千万级的企业客户。', delay: 30 },
    { speakerIdx: 0, text: '非常感谢您的分享，让我们对公司技术战略有了更清晰的认识。', delay: 35 },
    { speakerIdx: 1, text: '不客气，也感谢媒体朋友们的关注。', delay: 39 }
  ],
  [
    { speakerIdx: 0, text: '各位好，今天采访的主题是公司新财年战略，有请COO为我们解读。', delay: 0 },
    { speakerIdx: 1, text: '新财年我们的核心关键词是增长，整体营收目标120亿，同比增长40%，其中海外市场目标30亿。', delay: 4 },
    { speakerIdx: 0, text: '120亿的目标非常宏大，利润率预期如何？', delay: 9 },
    { speakerIdx: 1, text: '净利率目标15%，毛利率48%，主要靠产品结构优化和规模效应实现。', delay: 13 },
    { speakerIdx: 0, text: '组织架构方面会有调整吗？', delay: 18 },
    { speakerIdx: 1, text: '会成立专门的创新事业部，聚焦下一代产品和Project Alpha，预算5000万，由我直接分管。', delay: 22 },
    { speakerIdx: 0, text: '客户策略有什么变化？', delay: 27 },
    { speakerIdx: 1, text: '深化和客户A、客户B等战略客户的合作，目标KA客户数量增长50%，客户满意度提升10%。', delay: 30 },
    { speakerIdx: 0, text: '非常期待新财年公司的表现，感谢您的分享。', delay: 35 },
    { speakerIdx: 1, text: '谢谢，我们会用实际业绩回报大家的期待。', delay: 39 }
  ]
];

function getFileHash(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const content = `${stats.size}-${stats.mtimeMs}-${path.basename(filePath)}`;
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (e) {
    return crypto.randomBytes(16).toString('hex');
  }
}

function hashToIndex(hash, max) {
  let sum = 0;
  for (let i = 0; i < hash.length; i++) {
    sum = (sum + hash.charCodeAt(i)) % max;
  }
  return sum;
}

function validateAudioFile(audioPath) {
  return new Promise((resolve, reject) => {
    if (!audioPath) {
      return reject(new Error('音频文件路径为空'));
    }

    fs.stat(audioPath, (err, stats) => {
      if (err) {
        return reject(new Error('音频文件不存在或无法读取'));
      }

      if (stats.size === 0) {
        return reject(new Error('音频文件内容为空，大小为0字节'));
      }

      if (stats.size < 100) {
        return reject(new Error(`音频文件过小（${stats.size}字节），可能不是有效的音频文件`));
      }

      resolve(stats);
    });
  });
}

function mockTranscribe(audioPath, speakerNames = []) {
  return validateAudioFile(audioPath)
    .then(stats => {
      return new Promise((resolve, reject) => {
        const processDelay = 1500 + Math.floor(Math.random() * 1500);

        setTimeout(() => {
          try {
            if (Math.random() < 0.02) {
              return reject(new Error('转写服务暂时不可用，请稍后重试'));
            }

            const fileHash = getFileHash(audioPath);
            const templateIndex = hashToIndex(fileHash, INTERVIEW_TEMPLATES.length);
            const template = INTERVIEW_TEMPLATES[templateIndex];

            const defaultSpeakers = ['发言人A', '发言人B'];
            const speakers = speakerNames && speakerNames.length >= 2
              ? speakerNames
              : defaultSpeakers;

            const sentences = template.map((item, index) => {
              const detection = detectSensitiveContent(item.text);
              const speakerName = speakers[item.speakerIdx] || defaultSpeakers[item.speakerIdx];

              return {
                speakerName,
                speakerIndex: item.speakerIdx,
                startTime: item.delay,
                endTime: item.delay + 3.5 + Math.random(),
                content: item.text,
                sensitiveCategories: detection.categories,
                matchedSensitiveWords: detection.matchedWords
              };
            });

            if (sentences.length === 0) {
              return reject(new Error('转写结果为空，未能从音频中识别出有效内容'));
            }

            const duration = sentences.length > 0
              ? Math.round(sentences[sentences.length - 1].endTime)
              : 0;

            resolve({
              sentences,
              durationSeconds: duration,
              speakerCount: 2,
              audioFileSize: stats.size,
              templateUsed: templateIndex,
              fileHash
            });
          } catch (e) {
            reject(new Error(`转写过程中发生错误: ${e.message}`));
          }
        }, processDelay);
      });
    });
}

module.exports = {
  mockTranscribe,
  validateAudioFile
};
