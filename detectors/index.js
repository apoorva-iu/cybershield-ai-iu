'use strict';
const createDetectorRouter = require('./routes');
const { createProof } = require('./proof');
const { quotaMiddleware, isQuotaEnabled, setQuotaEnabled, resetQuotaMemory, getUsage } = require('./quota');
const { handleExtractText } = require('./extract-text');
const { handleAnalyze } = require('./analyze');
const { evaluateRules } = require('./rules');
const { extractLinks, inspectLinks, extractEmails, extractPhoneNumbers, extractUpiIds } = require('./evidence');
const { extractTextFromImage, analyzeTextWithGemini } = require('./gemini');

module.exports = {
  createDetectorRouter,
  createProof,
  quotaMiddleware,
  isQuotaEnabled,
  setQuotaEnabled,
  resetQuotaMemory,
  getUsage,
  handleExtractText,
  handleAnalyze,
  evaluateRules,
  extractLinks,
  inspectLinks,
  extractEmails,
  extractPhoneNumbers,
  extractUpiIds,
  extractTextFromImage,
  analyzeTextWithGemini
};

