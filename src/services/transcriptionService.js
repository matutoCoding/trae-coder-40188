const fs = require('fs');
const path = require('path');
const { detectSensitiveContent } = require('../models/sensitiveWordModel');
const config = require('../config');

const mockInterviewData = [
  { speaker: '张总', text: '大家好，欢迎参加今天的采访。首先介绍一下我们公司最新的发展情况。', delay: 0 },
  { speaker: '李记者', text: '张总您好，很高兴有这个机会。首先想请问一下，贵公司今年的营收目标是多少？', delay: 3 },
  { speaker: '张总', text: '关于财务数字方面，我们今年的目标是营收增长30%，达到五十亿的规模。具体的净利润数据还需要看下半年的表现。', delay: 6 },
  { speaker: '李记者', text: '了解了。那在产品方面，有没有什么新的动向可以透露？比如产品X的进展如何？', delay: 10 },
  { speaker: '张总', text: '产品X是我们正在研发的下一代产品，目前还属于未公开的状态，请暂时不要报道这部分内容。', delay: 14 },
  { speaker: '李记者', text: '好的，我明白了。那可以谈谈你们和重要客户的合作情况吗？比如客户A那边的项目进展。', delay: 18 },
  { speaker: '张总', text: '客户A是我们的战略客户之一，目前合作进展顺利。不过具体的项目细节涉及保密，不方便透露太多。', delay: 22 },
  { speaker: '李记者', text: '理解。那回到公开信息层面，贵公司在市场份额方面有什么优势？', delay: 26 },
  { speaker: '张总', text: '我们在行业内的市场份额大约占25%左右，处于领先地位。这主要得益于我们的技术优势和服务质量。', delay: 29 },
  { speaker: '李记者', text: '非常感谢张总的分享。最后还有一个问题，关于Project Alpha项目，您能简单介绍一下吗？', delay: 34 },
  { speaker: '张总', text: 'Project Alpha是我们的内部项目代号，目前还在保密阶段，暂时不能对外公布。等时机成熟我们会统一发布。', delay: 38 },
  { speaker: '李记者', text: '好的，非常感谢张总接受我们的采访。期待贵公司未来有更多好消息。', delay: 43 },
  { speaker: '张总', text: '谢谢，也感谢你们的关注。再见。', delay: 47 }
];

function mockTranscribe(audioPath, speakerNames = []) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        const sentences = mockInterviewData.map((item, index) => {
          const detection = detectSensitiveContent(item.text);

          let speakerName = item.speaker;
          let speakerIndex = item.speaker === '张总' ? 0 : 1;

          if (speakerNames && speakerNames.length > 0) {
            if (speakerIndex < speakerNames.length) {
              speakerName = speakerNames[speakerIndex];
            }
          }

          return {
            speakerName,
            speakerIndex,
            startTime: item.delay,
            endTime: item.delay + 3.5,
            content: item.text,
            sensitiveCategories: detection.categories
          };
        });

        const duration = sentences.length > 0
          ? sentences[sentences.length - 1].endTime
          : 0;

        resolve({
          sentences,
          durationSeconds: Math.round(duration),
          speakerCount: 2
        });
      } catch (e) {
        reject(e);
      }
    }, 2000);
  });
}

module.exports = {
  mockTranscribe
};
