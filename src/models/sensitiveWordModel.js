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

  return {
    isSensitive: matchedCategories.size > 0,
    categories: Array.from(matchedCategories),
    matchedWords
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
