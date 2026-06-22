const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const { initDatabase } = require('./models/database');
const { errorHandler } = require('./middleware/common');

const taskRoutes = require('./routes/tasks');
const transcriptRoutes = require('./routes/transcripts');
const reviewRoutes = require('./routes/review');
const sensitiveWordRoutes = require('./routes/sensitiveWords');

const app = express();

initDatabase();

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'interview-transcript-service',
    version: '1.0.0',
    timestamp: Date.now()
  });
});

app.use('/api/tasks', taskRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/sensitive-words', sensitiveWordRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API 端点不存在' });
});

app.use(errorHandler);

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`采访录音逐字稿服务已启动`);
  console.log(`服务地址: http://localhost:${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/api/health`);
  console.log(`上传目录: ${config.uploadDir}`);
  console.log(`数据库路径: ${config.dbPath}`);
});

module.exports = app;
