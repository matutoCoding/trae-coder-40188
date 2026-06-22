const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = 'localhost';
const PORT = 3000;

function request(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: result, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

function createMultipartBody(fields, files) {
  const boundary = '----TestBoundary' + crypto.randomBytes(8).toString('hex');
  let body = '';

  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }

  const buffers = [];
  buffers.push(Buffer.from(body, 'utf-8'));

  for (const [fieldName, filePath] of Object.entries(files)) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    let filePart = `--${boundary}\r\n`;
    filePart += `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n`;
    filePart += `Content-Type: application/octet-stream\r\n\r\n`;
    buffers.push(Buffer.from(filePart, 'utf-8'));
    buffers.push(fileBuffer);
    buffers.push(Buffer.from('\r\n', 'utf-8'));
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));

  return {
    body: Buffer.concat(buffers),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function createTestAudioFile(size = 5000, suffix = '') {
  const uploadDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const filePath = path.join(uploadDir, `test_${Date.now()}_${suffix}.mp3`);
  const bytes = crypto.randomBytes(size);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('='.repeat(70));
  console.log('采访录音逐字稿后端服务 - 增强功能集成测试');
  console.log('='.repeat(70));
  console.log('');

  let passed = 0;
  let failed = 0;
  const testFiles = [];

  function assert(description, condition, extra = '') {
    if (condition) {
      console.log(`  ✓ ${description}`);
      passed++;
    } else {
      console.log(`  ✗ ${description}`);
      if (extra) console.log(`    ${extra}`);
      failed++;
    }
  }

  try {
    console.log('=== 第一部分：音频必填与上传校验 ===');
    console.log('');

    console.log('1. 空音频提交应被拒绝');
    const noAudioResult = await request('/api/tasks', 'POST', {
      title: '空音频测试',
      submittedBy: 'test_user'
    });
    assert('返回 400 状态码', noAudioResult.status === 400);
    assert('错误信息提示音频必填',
      typeof noAudioResult.body.error === 'string' &&
      noAudioResult.body.error.includes('音频'));
    console.log('');

    console.log('2. 创建第一个测试音频文件并提交任务');
    const audio1 = createTestAudioFile(5000, 'a');
    testFiles.push(audio1);
    const mp1 = createMultipartBody({
      title: 'CEO战略采访 - 音频1',
      speakerNames: JSON.stringify(['张总', '李记者']),
      sensitivityLevel: 'confidential',
      submittedBy: 'pr_wang'
    }, { audio: audio1 });
    const task1Result = await request('/api/tasks', 'POST', mp1.body, { 'Content-Type': mp1.contentType });
    assert('返回 201 状态码', task1Result.status === 201, `实际: ${task1Result.status}`);
    assert('任务创建成功', task1Result.body.task !== undefined);
    assert('任务状态为 pending', task1Result.body.task.status === 'pending');
    const task1Id = task1Result.body.task.id;
    console.log(`   任务ID: ${task1Id}`);
    console.log('');

    console.log('3. 创建第二个不同音频文件并提交任务（验证差异化转写）');
    const audio2 = createTestAudioFile(8000, 'b');
    testFiles.push(audio2);
    const mp2 = createMultipartBody({
      title: '季度财报采访 - 音频2',
      speakerNames: JSON.stringify(['CFO王总', '财经记者赵']),
      sensitivityLevel: 'internal',
      submittedBy: 'finance_li'
    }, { audio: audio2 });
    const task2Result = await request('/api/tasks', 'POST', mp2.body, { 'Content-Type': mp2.contentType });
    assert('返回 201 状态码', task2Result.status === 201);
    const task2Id = task2Result.body.task.id;
    console.log(`   任务ID: ${task2Id}`);
    console.log('');

    console.log('4. 等待转写完成');
    await sleep(4000);
    const status1 = await request(`/api/tasks/${task1Id}`);
    const status2 = await request(`/api/tasks/${task2Id}`);
    assert('任务1转写完成', status1.body.status === 'completed', `实际状态: ${status1.body.status}，错误: ${status1.body.errorMessage || ''}`);
    assert('任务2转写完成', status2.body.status === 'completed', `实际状态: ${status2.body.status}，错误: ${status2.body.errorMessage || ''}`);
    const transcript1Id = status1.body.transcriptId;
    const transcript2Id = status2.body.transcriptId;
    console.log(`   逐字稿1ID: ${transcript1Id}`);
    console.log(`   逐字稿2ID: ${transcript2Id}`);
    console.log('');

    console.log('5. 验证两个音频产生不同的逐字稿内容');
    const trans1 = await request(`/api/transcripts/${transcript1Id}`);
    const trans2 = await request(`/api/transcripts/${transcript2Id}`);
    assert('逐字稿1有句子', trans1.body.sentences && trans1.body.sentences.length > 0);
    assert('逐字稿2有句子', trans2.body.sentences && trans2.body.sentences.length > 0);
    const content1 = trans1.body.sentences[0].content;
    const content2 = trans2.body.sentences[0].content;
    assert('两个逐字稿内容不同', content1 !== content2,
      `逐字稿1: ${content1.substring(0, 30)}... / 逐字稿2: ${content2.substring(0, 30)}...`);
    console.log('');

    console.log('6. 验证说话人姓名正确映射');
    const speaker1Names = trans1.body.speakers.map(s => s.speakerName);
    const speaker2Names = trans2.body.speakers.map(s => s.speakerName);
    assert('逐字稿1说话人包含"张总"', speaker1Names.includes('张总'), `实际: ${speaker1Names.join(', ')}`);
    assert('逐字稿1说话人包含"李记者"', speaker1Names.includes('李记者'), `实际: ${speaker1Names.join(', ')}`);
    assert('逐字稿2说话人包含"CFO王总"', speaker2Names.includes('CFO王总'), `实际: ${speaker2Names.join(', ')}`);
    assert('逐字稿2说话人包含"财经记者赵"', speaker2Names.includes('财经记者赵'), `实际: ${speaker2Names.join(', ')}`);
    console.log('');

    console.log('');
    console.log('=== 第二部分：财务数字精确检测 ===');
    console.log('');

    console.log('7. 增强财务敏感词检测 - 百分比和金额');
    const detectResult = await request('/api/sensitive-words/detect', 'POST', {
      text: '今年营收目标增长30%，收入约五十亿，利润率12.5%，预算5000万，净利润下降5%'
    });
    assert('检测为财务敏感', detectResult.body.isSensitive === true);
    assert('包含financial类别', detectResult.body.categories.includes('financial'));
    const words = detectResult.body.matchedWords.map(w => w.word);
    assert('检测到百分比 30%', words.includes('30%') || detectResult.body.matchedWords.some(w => w.pattern === '百分比数值'));
    assert('检测到利润率12.5%', words.some(w => w.includes('利润率') || w.includes('12.5%')));
    assert('检测到五十亿金额', words.some(w => w.includes('五十亿') || w.includes('亿')));
    assert('检测到5000万金额', words.some(w => w.includes('5000万') || w.includes('万')));
    assert('检测到增长数据', detectResult.body.matchedWords.some(w => w.pattern === '增长数据'));
    assert('检测到下降数据', detectResult.body.matchedWords.some(w => w.pattern === '下降数据'));
    console.log(`   匹配词: ${detectResult.body.matchedWords.map(w => w.word).join(', ')}`);
    console.log('');

    console.log('8. 逐字稿句子中包含匹配的敏感词详情');
    const financialSentence = trans1.body.sentences.find(s =>
      s.isSensitive && s.sensitiveCategories.includes('financial'));
    assert('找到财务敏感句子', !!financialSentence);
    assert('敏感句子包含 matchedSensitiveWords 字段',
      financialSentence.matchedSensitiveWords && financialSentence.matchedSensitiveWords.length > 0);
    assert('matchedSensitiveWords 包含具体匹配词',
      financialSentence.matchedSensitiveWords.every(w => w.word && w.category));
    console.log(`   敏感句内容: ${financialSentence.content.substring(0, 40)}...`);
    console.log(`   匹配详情: ${financialSentence.matchedSensitiveWords.map(w => `${w.word}(${w.category}${w.pattern ? ':' + w.pattern : ''})`).join(', ')}`);
    console.log('');

    console.log('');
    console.log('=== 第三部分：任务失败状态处理 ===');
    console.log('');

    console.log('9. 空音频文件触发失败状态');
    const emptyFilePath = path.join(__dirname, '..', 'uploads', `empty_${Date.now()}.wav`);
    fs.writeFileSync(emptyFilePath, Buffer.alloc(0));
    testFiles.push(emptyFilePath);
    const mpEmpty = createMultipartBody({
      title: '空文件失败测试',
      submittedBy: 'tester'
    }, { audio: emptyFilePath });
    const emptyTaskResult = await request('/api/tasks', 'POST', mpEmpty.body, { 'Content-Type': mpEmpty.contentType });
    assert('任务创建成功（进入队列）', emptyTaskResult.status === 201);
    const emptyTaskId = emptyTaskResult.body.task.id;
    await sleep(3500);
    const emptyStatus = await request(`/api/tasks/${emptyTaskId}`);
    assert('任务状态为 failed', emptyStatus.body.status === 'failed',
      `实际状态: ${emptyStatus.body.status}`);
    assert('包含清晰的错误信息',
      typeof emptyStatus.body.errorMessage === 'string' && emptyStatus.body.errorMessage.length > 0,
      `错误信息: ${emptyStatus.body.errorMessage}`);
    assert('错误信息包含音频内容为空等描述',
      emptyStatus.body.errorMessage.includes('空') ||
      emptyStatus.body.errorMessage.includes('0字节') ||
      emptyStatus.body.errorMessage.includes('大小'));
    console.log(`   失败原因: ${emptyStatus.body.errorMessage}`);
    console.log('');

    console.log('10. 失败任务重试功能');
    const retryResult = await request(`/api/tasks/${emptyTaskId}/retry`, 'POST');
    assert('重试请求成功', retryResult.status === 200);
    assert('重试后状态重置为 pending 或 processing',
      retryResult.body.task.status === 'pending' || retryResult.body.task.status === 'processing');
    console.log('');

    console.log('');
    console.log('=== 第四部分：其他核心功能回归测试 ===');
    console.log('');

    console.log('11. 审核意见与版本留痕');
    const targetSentence = trans1.body.sentences.find(s => s.isSensitive);
    const sentenceId = targetSentence.id;
    const c1 = await request(`/api/review/sentences/${sentenceId}/comments`, 'POST', {
      actionType: 'need_confirm',
      content: '需要确认财务数字准确性',
      reviewer: 'legal_zhang'
    });
    assert('添加v1审核意见成功', c1.status === 201 && c1.body.comment.version === 1);
    const c2 = await request(`/api/review/sentences/${sentenceId}/comments`, 'POST', {
      actionType: 'no_external',
      content: '财务数据不能外发',
      reviewer: 'pr_li'
    });
    assert('添加v2审核意见成功', c2.status === 201 && c2.body.comment.version === 2);
    assert('v2标记为最新版本', c2.body.comment.isLatest === true);
    const commentHistory = await request(`/api/review/sentences/${sentenceId}/comments`);
    assert('返回两条历史记录', commentHistory.body.total === 2);
    assert('历史记录按版本倒序', commentHistory.body.comments[0].version === 2);
    assert('v1不再是最新版本', commentHistory.body.comments[1].isLatest === false);
    console.log('');

    console.log('12. 逐字稿版本历史回溯');
    const history = await request(`/api/transcripts/${transcript1Id}/version-history`);
    assert('返回版本历史', history.status === 200);
    assert('包含总记录数', history.body.totalRecords >= 2);
    assert('按句子分组', history.body.sentenceCount >= 1);
    assert('每条记录包含修改人', history.body.changes[0].versions[0].reviewer !== undefined);
    assert('每条记录包含修改时间', history.body.changes[0].versions[0].createdAt !== undefined);
    assert('每条记录包含版本号', history.body.changes[0].versions[0].version !== undefined);
    console.log(`   修改记录数: ${history.body.totalRecords}`);
    console.log('');

    console.log('13. 敏感词管理 CRUD');
    const newWord = await request('/api/sensitive-words', 'POST', {
      word: '内部预算数字',
      category: 'financial',
      description: '内部预算数据'
    });
    assert('添加敏感词成功', newWord.status === 201);
    const wordList = await request('/api/sensitive-words');
    assert('敏感词列表包含预设词', wordList.body.total >= 10);
    assert('返回所有敏感类别', wordList.body.categories.length >= 4);
    console.log('');

    console.log('14. 任务列表筛选与分页');
    const completedList = await request('/api/tasks?status=completed');
    assert('已完成任务筛选正确',
      completedList.body.list.every(t => t.status === 'completed'));
    const pageList = await request('/api/tasks?page=1&pageSize=2');
    assert('分页page参数生效', pageList.body.page === 1);
    assert('分页pageSize参数生效', pageList.body.pageSize === 2);
    console.log('');

    console.log('='.repeat(70));
    console.log('测试结果汇总');
    console.log('='.repeat(70));
    console.log(`  通过: ${passed}`);
    console.log(`  失败: ${failed}`);
    console.log(`  总计: ${passed + failed}`);

    if (failed === 0) {
      console.log('');
      console.log('  🎉 所有增强功能测试通过！');
    } else {
      console.log('');
      console.log('  ⚠️  部分测试失败，请检查相关功能');
    }
    console.log('='.repeat(70));

    testFiles.forEach(f => {
      try { fs.unlinkSync(f); } catch (e) {}
    });

    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.error('测试执行出错:', err.message);
    console.error(err.stack);
    testFiles.forEach(f => {
      try { fs.unlinkSync(f); } catch (e) {}
    });
    process.exit(1);
  }
}

runTests();
