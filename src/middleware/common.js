function jsonParser(req, res, next) {
  if (req.is('json')) {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        req.body = data ? JSON.parse(data) : {};
        next();
      } catch (e) {
        res.status(400).json({ error: '无效的 JSON 格式' });
      }
    });
  } else {
    next();
  }
}

function errorHandler(err, req, res, next) {
  console.error('API Error:', err);
  res.status(500).json({
    error: err.message || '服务器内部错误',
    code: err.code || 'INTERNAL_ERROR'
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function validateRequired(fields) {
  return (req, res, next) => {
    const missing = [];
    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null) {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({
        error: `缺少必填字段: ${missing.join(', ')}`
      });
    }
    next();
  };
}

module.exports = {
  jsonParser,
  errorHandler,
  asyncHandler,
  validateRequired
};
