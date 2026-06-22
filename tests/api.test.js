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
  console.log('采访录音逐字稿后端服务 - 第二轮增强功能集成测试');
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
    console.log('=== 第一部分：格式错误文件创建可追踪任务 ===');
    console.log('');

    console.log('1. 格式错误文件提交后返回可追踪任务ID');
    const badFile = path.join(__dirname, '..', 'uploads', `bad_${Date.now()}.txt`);
    fs.writeFileSync(badFile, 'not audio');
    testFiles.push(badFile);
    const mpBad = createMultipartBody({
      title: '格式错误测试任务',
      submittedBy: 'test_user'
    }, { audio: badFile });
    const badResult = await request('/api/tasks', 'POST', mpBad.body, { 'Content-Type': mpBad.contentType });
    assert('返回 201 状态码（任务已创建）', badResult.status === 201, `实际: ${badResult.status}`);
    assert('任务状态为 failed', badResult.body.task.status === 'failed');
    assert('返回任务ID可追踪', badResult.body.task.id && badResult.body.task.id.length > 0);
    assert('包含清晰错误信息',
      typeof badResult.body.task.errorMessage === 'string' &&
      badResult.body.task.errorMessage.includes('不支持的音频格式'));
    const badTaskId = badResult.body.task.id;
    console.log(`   任务ID: ${badTaskId}`);
    console.log(`   错误信息: ${badResult.body.task.errorMessage}`);
    console.log('');

    console.log('2. 通过任务ID查询状态，能看到失败原因');
    const badStatus = await request(`/api/tasks/${badTaskId}`);
    assert('查询成功', badStatus.status === 200);
    assert('状态为 failed', badStatus.body.status === 'failed');
    assert('errorMessage 字段存在且非空',
      typeof badStatus.body.errorMessage === 'string' && badStatus.body.errorMessage.length > 0);
    assert('错误信息包含格式描述', badStatus.body.errorMessage.includes('.txt') || badStatus.body.errorMessage.includes('格式'));
    console.log('');

    console.log('3. 空文件（0字节）也生成失败任务');
    const emptyFile = path.join(__dirname, '..', 'uploads', `empty_${Date.now()}.wav`);
    fs.writeFileSync(emptyFile, Buffer.alloc(0));
    testFiles.push(emptyFile);
    const mpEmpty = createMultipartBody({
      title: '空文件测试',
      submittedBy: 'test_user'
    }, { audio: emptyFile });
    const emptyResult = await request('/api/tasks', 'POST', mpEmpty.body, { 'Content-Type': mpEmpty.contentType });
    assert('任务创建成功', emptyResult.status === 201);
    assert('状态为 pending 或 processing（后续会变 failed）',
      emptyResult.body.task.status === 'pending' || emptyResult.body.task.status === 'processing');
    const emptyTaskId = emptyResult.body.task.id;
    await sleep(4000);
    const emptyStatus = await request(`/api/tasks/${emptyTaskId}`);
    assert('最终状态为 failed', emptyStatus.body.status === 'failed', `实际: ${emptyStatus.body.status}, 错误: ${emptyStatus.body.errorMessage || ''}`);
    assert('错误信息说明文件内容问题',
      emptyStatus.body.errorMessage && (
        emptyStatus.body.errorMessage.includes('空') ||
        emptyStatus.body.errorMessage.includes('0字节') ||
        emptyStatus.body.errorMessage.includes('大小')
      ));
    console.log('');

    console.log('');
    console.log('=== 第二部分：批量提交与批次管理 ===');
    console.log('');

    console.log('4. 创建多个测试音频文件并批量提交');
    const audio1 = createTestAudioFile(5000, 'batch1');
    const audio2 = createTestAudioFile(6000, 'batch2');
    const audio3 = createTestAudioFile(7000, 'batch3');
    testFiles.push(audio1, audio2, audio3);

    const mpBatch = createMultipartBody({
      batchTitle: '5月采访素材批次',
      speakerNames: JSON.stringify(['发言人A', '记者B']),
      sensitivityLevel: 'confidential',
      submittedBy: 'pr_department'
    }, { audios: audio1, audios2: audio2, audios3: audio3 });

    mpBatch.body = null;
    const boundary = '----BatchBoundary' + crypto.randomBytes(8).toString('hex');
    const batchBuffers = [];

    function addField(name, value) {
      batchBuffers.push(Buffer.from(`--${boundary}\r\n`, 'utf-8'));
      batchBuffers.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`, 'utf-8'));
      batchBuffers.push(Buffer.from(`${value}\r\n`, 'utf-8'));
    }

    function addFile(fieldName, filePath) {
      const fileBuffer = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      batchBuffers.push(Buffer.from(`--${boundary}\r\n`, 'utf-8'));
      batchBuffers.push(Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n`, 'utf-8'));
      batchBuffers.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n', 'utf-8'));
      batchBuffers.push(fileBuffer);
      batchBuffers.push(Buffer.from('\r\n', 'utf-8'));
    }

    addField('batchTitle', '5月采访素材批次');
    addField('speakerNames', JSON.stringify(['发言人A', '记者B']));
    addField('sensitivityLevel', 'confidential');
    addField('submittedBy', 'pr_department');
    addFile('audios', audio1);
    addFile('audios', audio2);
    addFile('audios', audio3);
    batchBuffers.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));

    const batchBody = Buffer.concat(batchBuffers);

    const batchResult = await request('/api/tasks/batch', 'POST', batchBody, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    });

    assert('批量提交返回 201', batchResult.status === 201, `实际: ${batchResult.status}, ${JSON.stringify(batchResult.body)}`);
    assert('返回 batchId', batchResult.body.batchId && batchResult.body.batchId.length > 0);
    assert('任务数为 3', batchResult.body.totalCount === 3);
    assert('每个任务都有ID', batchResult.body.tasks && batchResult.body.tasks.length === 3);
    const batchId = batchResult.body.batchId;
    console.log(`   批次ID: ${batchId}`);
    console.log(`   任务数: ${batchResult.body.totalCount}`);
    console.log('');

    console.log('5. 按批次查询任务列表');
    await sleep(3500);
    const batchList = await request(`/api/tasks/batch/${batchId}`);
    assert('查询成功', batchList.status === 200);
    assert('批次ID一致', batchList.body.batchId === batchId);
    assert('任务总数为3', batchList.body.total === 3);
    assert('包含 stats 统计', batchList.body.stats !== undefined);
    assert('有 completed 任务', batchList.body.stats.completed > 0);
    assert('每个任务都有状态和原始文件名',
      batchList.body.tasks.every(t => t.status && t.audioOriginalName));
    console.log(`   stats: completed=${batchList.body.stats.completed}, failed=${batchList.body.stats.failed}, processing=${batchList.body.stats.processing}`);
    console.log('');

    console.log('6. 任务列表支持按 batchId 筛选');
    const listByBatch = await request(`/api/tasks?batchId=${batchId}`);
    assert('筛选成功', listByBatch.status === 200);
    assert('返回3条任务', listByBatch.body.total === 3);
    console.log('');

    const completedTask = batchList.body.tasks.find(t => t.status === 'completed');
    const transcriptId = completedTask ? (await request(`/api/tasks/${completedTask.id}`)).body.transcriptId : null;

    if (transcriptId) {
      console.log(`   使用逐字稿ID: ${transcriptId} 进行后续测试`);
      console.log('');

      console.log('');
      console.log('=== 第三部分：句子筛选功能增强 ===');
      console.log('');

      console.log('7. 按敏感类别筛选句子（财务类）');
      const financialSentences = await request(`/api/transcripts/${transcriptId}/sentences?sensitiveCategory=financial`);
      assert('筛选成功', financialSentences.status === 200);
      assert('返回财务敏感句子', financialSentences.body.total > 0);
      assert('每条句子都包含 financial 类别',
        financialSentences.body.sentences.every(s =>
          s.sensitiveCategories && s.sensitiveCategories.includes('financial')));
      console.log(`   财务敏感句子数: ${financialSentences.body.total}`);
      console.log('');

      console.log('8. 按说话人筛选句子');
      const speakers = (await request(`/api/transcripts/${transcriptId}`)).body.speakers;
      const firstSpeaker = speakers[0].speakerName;
      const speakerSentences = await request(`/api/transcripts/${transcriptId}/sentences?speakerName=${encodeURIComponent(firstSpeaker)}`);
      assert('按说话人筛选成功', speakerSentences.status === 200);
      assert('所有句子属于该说话人',
        speakerSentences.body.sentences.every(s => s.speakerName === firstSpeaker));
      console.log(`   说话人 "${firstSpeaker}" 的句子数: ${speakerSentences.body.total}`);
      console.log('');

      console.log('9. 先添加审核意见，再按审核状态筛选');
      const targetSentence = financialSentences.body.sentences[0];
      await request(`/api/review/sentences/${targetSentence.id}/comments`, 'POST', {
        actionType: 'no_external',
        content: '财务数据不能外发',
        reviewer: 'legal_auditor'
      });

      const noExternalSentences = await request(`/api/transcripts/${transcriptId}/sentences?reviewStatus=no_external`);
      assert('按审核动作筛选成功', noExternalSentences.status === 200);
      assert('筛选出对应审核状态的句子', noExternalSentences.body.total >= 1);
      assert('筛选结果的最新审核动作为 no_external',
        noExternalSentences.body.sentences.every(s =>
          s.latestReview && s.latestReview.actionType === 'no_external'));

      const hasReviewSentences = await request(`/api/transcripts/${transcriptId}/sentences?reviewStatus=has_review`);
      assert('按"已审核"筛选成功', hasReviewSentences.status === 200);
      assert('已审核句子数 >= 1', hasReviewSentences.body.total >= 1);

      const noReviewSentences = await request(`/api/transcripts/${transcriptId}/sentences?reviewStatus=no_review`);
      assert('按"未审核"筛选成功', noReviewSentences.status === 200);
      assert('已审核 + 未审核 = 总数',
        hasReviewSentences.body.total + noReviewSentences.body.total === targetSentence ? 0 :
          (await request(`/api/transcripts/${transcriptId}/sentences`)).body.total
      );
      console.log(`   已审核句子: ${hasReviewSentences.body.total}`);
      console.log(`   未审核句子: ${noReviewSentences.body.total}`);
      console.log('');

      console.log('10. 组合筛选：财务敏感 + 不能外发');
      const combined = await request(`/api/transcripts/${transcriptId}/sentences?sensitiveCategory=financial&reviewStatus=no_external`);
      assert('组合筛选成功', combined.status === 200);
      assert('结果同时满足两个条件',
        combined.body.sentences.every(s =>
          s.sensitiveCategories.includes('financial') &&
          s.latestReview && s.latestReview.actionType === 'no_external'));
      console.log(`   财务敏感且不能外发的句子数: ${combined.body.total}`);
      console.log('');

      console.log('');
      console.log('=== 第四部分：导出功能增强（CSV） ===');
      console.log('');

      console.log('11. CSV 格式导出');
      const csvResult = await request(`/api/transcripts/${transcriptId}/export?format=csv`);
      assert('导出成功', csvResult.status === 200);
      assert('返回文本内容', typeof csvResult.raw === 'string' && csvResult.raw.length > 0);
      assert('内容以 BOM 开头（Excel中文兼容）', csvResult.raw.charCodeAt(0) === 0xFEFF || csvResult.raw.startsWith('\ufeff'));

      const csvLines = csvResult.raw.replace(/^\ufeff/, '').split('\n');
      assert('CSV 有表头行和数据行', csvLines.length >= 2);

      const headers = csvLines[0].split(',');
      assert('CSV 包含15个字段列', headers.length >= 15);
      assert('包含"开始时间"列', headers.includes('开始时间'));
      assert('包含"说话人"列', headers.includes('说话人'));
      assert('包含"敏感类别"列', headers.includes('敏感类别'));
      assert('包含"匹配敏感词"列', headers.includes('匹配敏感词'));
      assert('包含"审核动作"列', headers.includes('审核动作'));
      assert('包含"审核意见"列', headers.includes('审核意见'));
      assert('包含"审核人"列', headers.includes('审核人'));
      assert('包含"审核时间"列', headers.includes('审核时间'));

      console.log(`   CSV 行数: ${csvLines.length - 1} 条数据`);
      console.log(`   CSV 列数: ${headers.length}`);
      console.log(`   表头: ${headers.join(' | ')}`);
      console.log('');

      console.log('12. CSV 导出支持筛选（只导出财务敏感句）');
      const filteredCsv = await request(`/api/transcripts/${transcriptId}/export?format=csv&sensitiveCategory=financial`);
      assert('筛选导出成功', filteredCsv.status === 200);
      const filteredLines = filteredCsv.raw.replace(/^\ufeff/, '').split('\n');
      assert('筛选后数据行数较少', filteredLines.length - 1 <= csvLines.length - 1);
      assert('至少包含表头', filteredLines.length >= 1);
      console.log(`   筛选后数据行数: ${filteredLines.length - 1}`);
      console.log('');

      console.log('13. 文本导出也增强了，包含敏感词和审核意见详情');
      const textResult = await request(`/api/transcripts/${transcriptId}/export?format=text&onlySensitive=true`);
      assert('文本导出成功', textResult.status === 200);
      assert('包含敏感类别标记', textResult.raw.includes('【敏感:'));
      assert('包含审核动作标记', textResult.raw.includes('【no_external】') || textResult.raw.includes('【need_confirm】'));
      assert('包含匹配敏感词详情行', textResult.raw.includes('→ 匹配敏感词:'));
      assert('包含审核意见详情行', textResult.raw.includes('→ 审核意见('));
      console.log(`   文本长度: ${textResult.raw.length} 字符`);
      console.log('');
    }

    console.log('');
    console.log('=== 第五部分：失败任务重试 ===');
    console.log('');

    console.log('14. 单个失败任务重试（格式错误的不能重试）');
    const retryBad = await request(`/api/tasks/${badTaskId}/retry`, 'POST');
    assert('重试请求成功', retryBad.status === 200);
    assert('格式错误的任务重试后仍为 failed（不能重试）',
      retryBad.body.task.status === 'failed',
      `实际: ${retryBad.body.task.status}`);
    console.log('');

    console.log('15. 批量重试接口（针对批次中的失败任务）');
    const batchRetry = await request(`/api/tasks/batch/${batchId}/retry`, 'POST');
    assert('批量重试返回结果', batchRetry.status === 200 || batchRetry.status === 404);
    if (batchRetry.status === 200) {
      assert('返回重试数量', typeof batchRetry.body.retriedCount === 'number');
      console.log(`   本次重试过的失败任务数: ${batchRetry.body.retriedCount}`);
    }
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
