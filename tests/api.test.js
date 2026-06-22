const http = require('http');

const BASE_URL = 'localhost';
const PORT = 3000;

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: result });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('采访录音逐字稿后端服务 - API 集成测试');
  console.log('='.repeat(60));
  console.log('');

  let passed = 0;
  let failed = 0;

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
    console.log('1. 健康检查');
    const health = await request('/api/health');
    assert('返回 200 状态码', health.status === 200);
    assert('服务状态正常', health.body.status === 'ok');
    console.log('');

    console.log('2. 创建转写任务');
    const createResult = await request('/api/tasks', 'POST', {
      title: '产品战略发布会采访',
      speakerNames: ['王总', '赵记者'],
      sensitivityLevel: 'confidential',
      submittedBy: 'test_user'
    });
    assert('返回 201 状态码', createResult.status === 201);
    assert('任务创建成功', createResult.body.task !== undefined);
    assert('任务状态为 pending', createResult.body.task.status === 'pending');
    assert('返回状态查询 URL', createResult.body.statusUrl !== undefined);

    const taskId = createResult.body.task.id;
    console.log(`   任务ID: ${taskId}`);
    console.log('');

    console.log('3. 等待转写完成并查询任务状态');
    await sleep(2500);

    const statusResult = await request(`/api/tasks/${taskId}`);
    assert('返回 200 状态码', statusResult.status === 200);
    assert('转写已完成', statusResult.body.status === 'completed');
    assert('返回逐字稿 ID', statusResult.body.transcriptId !== undefined);
    assert('返回逐字稿链接', statusResult.body.transcriptUrl !== undefined);
    assert('包含句子总数', statusResult.body.totalSentences > 0);

    const transcriptId = statusResult.body.transcriptId;
    console.log(`   逐字稿ID: ${transcriptId}`);
    console.log(`   句子总数: ${statusResult.body.totalSentences}`);
    console.log('');

    console.log('4. 获取逐字稿详情');
    const transcriptResult = await request(`/api/transcripts/${transcriptId}`);
    assert('返回 200 状态码', transcriptResult.status === 200);
    assert('包含说话人信息', transcriptResult.body.speakers.length > 0);
    assert('包含句子列表', transcriptResult.body.sentences.length > 0);
    assert('识别出敏感句子', transcriptResult.body.sensitiveSentenceCount > 0);

    const sentences = transcriptResult.body.sentences;
    const sensitiveSentence = sentences.find(s => s.isSensitive);
    assert('敏感句带有敏感类别标记',
      sensitiveSentence && sensitiveSentence.sensitiveCategories.length > 0);
    console.log(`   说话人数: ${transcriptResult.body.speakers.length}`);
    console.log(`   敏感句子数: ${transcriptResult.body.sensitiveSentenceCount}`);
    console.log('');

    console.log('5. 添加审核意见（版本1）');
    const targetSentence = sentences.find(s => s.isSensitive);
    const sentenceId = targetSentence.id;

    const comment1Result = await request(`/api/review/sentences/${sentenceId}/comments`, 'POST', {
      actionType: 'need_confirm',
      content: '此句涉及未公开产品信息，请法务确认',
      reviewer: 'pr_reviewer'
    });
    assert('返回 201 状态码', comment1Result.status === 201);
    assert('评论创建成功', comment1Result.body.comment !== undefined);
    assert('版本号为 1', comment1Result.body.comment.version === 1);
    assert('标记为最新版本', comment1Result.body.comment.isLatest === true);
    console.log('');

    console.log('6. 添加审核意见（版本2 - 更新意见）');
    const comment2Result = await request(`/api/review/sentences/${sentenceId}/comments`, 'POST', {
      actionType: 'no_external',
      content: '确认不能外发，属于内部保密信息',
      reviewer: 'legal_reviewer'
    });
    assert('返回 201 状态码', comment2Result.status === 201);
    assert('版本号递增为 2', comment2Result.body.comment.version === 2);
    assert('新版本标记为最新', comment2Result.body.comment.isLatest === true);
    console.log('');

    console.log('7. 查询句子的所有版本历史');
    const historyResult = await request(`/api/review/sentences/${sentenceId}/comments`);
    assert('返回 200 状态码', historyResult.status === 200);
    assert('共有 2 条历史记录', historyResult.body.total === 2);
    assert('按版本倒序排列',
      historyResult.body.comments[0].version === 2 &&
      historyResult.body.comments[1].version === 1);
    assert('旧版本不再标记为最新', historyResult.body.comments[1].isLatest === false);
    console.log('');

    console.log('8. 查询逐字稿完整版本历史（回溯用）');
    const fullHistoryResult = await request(`/api/transcripts/${transcriptId}/version-history`);
    assert('返回 200 状态码', fullHistoryResult.status === 200);
    assert('包含修改记录数', fullHistoryResult.body.totalRecords >= 2);
    assert('按句子分组展示', fullHistoryResult.body.sentenceCount >= 1);
    assert('包含修改人和时间信息',
      fullHistoryResult.body.changes[0].versions[0].reviewer !== undefined &&
      fullHistoryResult.body.changes[0].versions[0].createdAt !== undefined);
    console.log('');

    console.log('9. 查询审核汇总');
    const summaryResult = await request(`/api/transcripts/${transcriptId}/review-summary`);
    assert('返回 200 状态码', summaryResult.status === 200);
    assert('包含已审核数量', summaryResult.body.totalReviewed >= 1);
    assert('按动作类型统计', summaryResult.body.byAction.no_external === 1);
    console.log('');

    console.log('10. 敏感词管理 - 获取列表');
    const wordsResult = await request('/api/sensitive-words');
    assert('返回 200 状态码', wordsResult.status === 200);
    assert('包含类别列表', wordsResult.body.categories.length >= 4);
    assert('包含预置敏感词', wordsResult.body.total >= 10);
    console.log(`   预置敏感词数: ${wordsResult.body.total}`);
    console.log('');

    console.log('11. 敏感词管理 - 添加新词');
    const addWordResult = await request('/api/sensitive-words', 'POST', {
      word: '机密项目',
      category: 'unreleased_product',
      description: '高度机密的项目名称'
    });
    assert('返回 201 状态码', addWordResult.status === 201);
    assert('新词添加成功', addWordResult.body.word !== undefined);
    console.log('');

    console.log('12. 敏感词检测');
    const detectResult = await request('/api/sensitive-words/detect', 'POST', {
      text: '关于机密项目的进展，我们将在适当时机向客户A公布营收目标'
    });
    assert('返回 200 状态码', detectResult.status === 200);
    assert('检测为敏感内容', detectResult.body.isSensitive === true);
    assert('识别出多个类别', detectResult.body.categories.length >= 2);
    assert('匹配到具体敏感词', detectResult.body.matchedWords.length >= 2);
    console.log(`   匹配敏感词: ${detectResult.body.matchedWords.map(w => w.word).join(', ')}`);
    console.log('');

    console.log('13. 任务列表查询');
    const listResult = await request('/api/tasks?page=1&pageSize=10');
    assert('返回 200 状态码', listResult.status === 200);
    assert('包含分页信息', listResult.body.page === 1 && listResult.body.pageSize === 10);
    assert('列表中包含已创建的任务', listResult.body.total >= 1);
    console.log('');

    console.log('14. 按状态筛选任务');
    const filteredResult = await request('/api/tasks?status=completed');
    assert('返回 200 状态码', filteredResult.status === 200);
    assert('筛选结果状态正确',
      filteredResult.body.list.every(t => t.status === 'completed'));
    console.log('');

    console.log('='.repeat(60));
    console.log('测试结果汇总');
    console.log('='.repeat(60));
    console.log(`  通过: ${passed}`);
    console.log(`  失败: ${failed}`);
    console.log(`  总计: ${passed + failed}`);

    if (failed === 0) {
      console.log('');
      console.log('  🎉 所有测试通过！');
    } else {
      console.log('');
      console.log('  ⚠️  部分测试失败，请检查相关功能');
    }
    console.log('='.repeat(60));

    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.error('测试执行出错:', err.message);
    process.exit(1);
  }
}

runTests();
