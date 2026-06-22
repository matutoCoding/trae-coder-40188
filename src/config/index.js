const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  uploadDir: path.join(__dirname, '..', '..', 'uploads'),
  dbPath: path.join(__dirname, '..', '..', 'data', 'transcript.db'),
  taskStatus: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
  },
  sensitivityLevels: {
    PUBLIC: 'public',
    INTERNAL: 'internal',
    CONFIDENTIAL: 'confidential',
    RESTRICTED: 'restricted'
  },
  sensitiveCategories: {
    UNRELEASED_PRODUCT: 'unreleased_product',
    FINANCIAL: 'financial',
    CUSTOMER_NAME: 'customer_name',
    LEGAL: 'legal'
  },
  reviewActions: {
    NEED_CONFIRM: 'need_confirm',
    NO_EXTERNAL: 'no_external',
    CAN_QUOTE: 'can_quote',
    NEED_REVISE: 'need_revise'
  }
};
