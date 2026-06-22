const { getDb, saveDatabase } = require('./database');

function getAllSensitiveWords(activeOnly = true) {
  const db = getDb();
  let words = db.sensitiveWords.slice();

  if (activeOnly) {
    words = words.filter(w => w.isActive);
  }

  words.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.word.localeCompare(b.word);
  });

  return words.map(w => ({
    id: w.id,
    word: w.word,
    category: w.category,
    description: w.description,
    createdAt: w.createdAt,
    isActive: w.isActive
  }));
}

function getSensitiveWordsByCategory(category) {
  const db = getDb();
  const words = db.sensitiveWords
    .filter(w => w.category === category && w.isActive)
    .sort((a, b) => a.word.localeCompare(b.word));

  return words.map(w => ({
    id: w.id,
    word: w.word,
    category: w.category,
    description: w.description,
    createdAt: w.createdAt,
    isActive: w.isActive
  }));
}

function addSensitiveWord(word, category, description = '') {
  const db = getDb();
  const now = Date.now();

  const exists = db.sensitiveWords.some(w => w.word === word);
  if (exists) {
    return null;
  }

  db._meta.sensitiveWordIdSeq++;
  const id = db._meta.sensitiveWordIdSeq;

  const newWord = {
    id,
    word,
    category,
    description,
    createdAt: now,
    isActive: true
  };

  db.sensitiveWords.push(newWord);
  saveDatabase();

  return { ...newWord };
}

function toggleSensitiveWord(id, isActive) {
  const db = getDb();
  const word = db.sensitiveWords.find(w => w.id === parseInt(id));

  if (!word) return false;

  word.isActive = isActive;
  saveDatabase();
  return true;
}

function deleteSensitiveWord(id) {
  const db = getDb();
  const index = db.sensitiveWords.findIndex(w => w.id === parseInt(id));

  if (index === -1) return false;

  db.sensitiveWords.splice(index, 1);
  saveDatabase();
  return true;
}

const FINANCIAL_PATTERNS = [
  { regex: /\d+(\.\d+)?%/g, label: '百分比数值', desc: '增长/利润率等百分比' },
  { regex: /增长\s*\d+(\.\d+)?%?/g, label: '增长数据', desc: '增长率描述' },
  { regex: /下降\s*\d+(\.\d+)?%?/g, label: '下降数据', desc: '下降率描述' },
  { regex: /(收入|营收|利润|净利润|毛利|预算|成本|支出|销售额|营业额)\s*(约|达到|为|是)?\s*[一二三四五六七八九十百千万亿\d\.]+(元|万|亿|千)?/g, label: '财务金额', desc: '财务数据描述' },
  { regex: /利润率\s*\d+(\.\d+)?%?/g, label: '利润率数据', desc: '利润率指标' },
  { regex: /毛利率\s*\d+(\.\d+)?%?/g, label: '毛利率数据', desc: '毛利率指标' },
  { regex: /净利率\s*\d+(\.\d+)?%?/g, label: '净利率数据', desc: '净利率指标' },
  { regex: /[一二三四五六七八九十百千]?\d*\.?\d+\s*(万|亿|千万|百万|千元?|元)/g, label: '金额数字', desc: '大额金额单位' },
  { regex: /(营收|收入)目标/g, label: '营收目标', desc: '收入目标相关' },
  { regex: /市场份额\s*(约|达到|为|占)?\s*\d*\.?\d+%?/g, label: '市场份额数据', desc: '市场份额指标' }
];

function detectSensitiveContent(text) {
  const db = getDb();
  const words = db.sensitiveWords.filter(w => w.isActive);

  const matchedCategories = new Set();
  const matchedWords = [];

  for (const { word, category } of words) {
    if (text.includes(word)) {
      matchedCategories.add(category);
      matchedWords.push({ word, category });
    }
  }

  for (const pattern of FINANCIAL_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches && matches.length > 0) {
      matchedCategories.add('financial');
      matches.forEach(m => {
        matchedWords.push({
          word: m,
          category: 'financial',
          pattern: pattern.label
        });
      });
    }
  }

  const uniqueWords = [];
  const seen = new Set();
  for (const mw of matchedWords) {
    const key = `${mw.category}:${mw.word}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueWords.push(mw);
    }
  }

  return {
    isSensitive: matchedCategories.size > 0,
    categories: Array.from(matchedCategories),
    matchedWords: uniqueWords
  };
}

module.exports = {
  getAllSensitiveWords,
  getSensitiveWordsByCategory,
  addSensitiveWord,
  toggleSensitiveWord,
  deleteSensitiveWord,
  detectSensitiveContent
};
