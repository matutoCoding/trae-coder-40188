const fs = require('fs');
const path = require('path');
const config = require('../config');

let dbData = null;
let dataFilePath = null;

function initDatabase() {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  dataFilePath = path.join(dataDir, 'db.json');

  if (fs.existsSync(dataFilePath)) {
    const raw = fs.readFileSync(dataFilePath, 'utf-8');
    dbData = JSON.parse(raw);
  } else {
    dbData = {
      tasks: {},
      transcripts: {},
      sentences: {},
      reviewComments: {},
      sensitiveWords: [],
      _meta: {
        sensitiveWordIdSeq: 0
      }
    };
    insertInitialData();
    saveDatabase();
  }

  return dbData;
}

function saveDatabase() {
  if (!dataFilePath) {
    initDatabase();
  }
  fs.writeFileSync(dataFilePath, JSON.stringify(dbData, null, 2), 'utf-8');
}

function insertInitialData() {
  const now = Date.now();
  const words = [
    { word: '产品X', category: 'unreleased_product', description: '未发布产品代号' },
    { word: 'Project Alpha', category: 'unreleased_product', description: '内部项目代号' },
    { word: '下一代产品', category: 'unreleased_product', description: '未发布产品描述' },
    { word: '营收目标', category: 'financial', description: '财务数字相关' },
    { word: '净利润', category: 'financial', description: '财务数字相关' },
    { word: '市场份额', category: 'financial', description: '财务数字相关' },
    { word: '毛利率', category: 'financial', description: '财务数字相关' },
    { word: '亿', category: 'financial', description: '大额数字单位' },
    { word: '千万', category: 'financial', description: '大额数字单位' },
    { word: '百万', category: 'financial', description: '大额数字单位' },
    { word: '客户A', category: 'customer_name', description: '客户名称' },
    { word: '客户B', category: 'customer_name', description: '客户名称' },
    { word: '战略客户', category: 'customer_name', description: '重要客户代称' },
    { word: '未公开', category: 'legal', description: '法律敏感信息' },
    { word: '保密', category: 'legal', description: '保密信息' },
    { word: '内部资料', category: 'legal', description: '内部信息' }
  ];

  dbData.sensitiveWords = words.map((w, i) => ({
    id: i + 1,
    word: w.word,
    category: w.category,
    description: w.description,
    createdAt: now,
    isActive: true
  }));
  dbData._meta.sensitiveWordIdSeq = words.length;
}

function getDb() {
  if (!dbData) {
    initDatabase();
  }
  return dbData;
}

module.exports = {
  initDatabase,
  getDb,
  saveDatabase
};
