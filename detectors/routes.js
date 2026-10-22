'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const cfg = require('../config');
const { handleExtractText } = require('./extract-text');
const { handleAnalyze } = require('./analyze');
const { quotaMiddleware, quotaRoute } = require('./quota');

const router = express.Router();
const sec = cfg.runtime.security || {};

// Rate limiters for POST /api/extract-text (separate limits)
const extractLimiterMin = rateLimit({
  windowMs: 60000,
  max: (sec.extractTextRateLimit && sec.extractTextRateLimit.perMinute) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many text extraction requests. Please wait a minute and try again.' })
});

const extractLimiterDay = rateLimit({
  windowMs: 86400000,
  max: (sec.extractTextRateLimit && sec.extractTextRateLimit.perDay) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Daily text extraction limit reached. Please try again tomorrow.' })
});

// Rate limiters for POST /api/analyze (separate limits from /api/verify)
const analyzeAnonLimiterMin = rateLimit({
  windowMs: 60000,
  max: (sec.analyzeRateLimit && sec.analyzeRateLimit.perMinute) || 15,
  skip: req => Boolean(req.user && req.user.id),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many analysis requests. Please wait a minute and try again.' })
});

const analyzeAnonLimiterDay = rateLimit({
  windowMs: 86400000,
  max: (sec.analyzeRateLimit && sec.analyzeRateLimit.perDay) || 150,
  skip: req => Boolean(req.user && req.user.id),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Daily analysis limit reached. Please try again tomorrow.' })
});

const analyzeSignedInLimiterMin = rateLimit({
  windowMs: 60000,
  max: (sec.analyzeRateLimitSignedIn && sec.analyzeRateLimitSignedIn.perMinute) || 30,
  keyGenerator: req => req.user.id,
  skip: req => !(req.user && req.user.id),
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many analysis requests. Please wait a minute and try again.' })
});

const analyzeSignedInLimiterDay = rateLimit({
  windowMs: 86400000,
  max: (sec.analyzeRateLimitSignedIn && sec.analyzeRateLimitSignedIn.perDay) || 500,
  keyGenerator: req => req.user.id,
  skip: req => !(req.user && req.user.id),
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Daily analysis limit reached. Please try again tomorrow.' })
});

module.exports = function createDetectorRouter(optionalAuthMiddleware) {
  const auth = optionalAuthMiddleware || ((req, res, next) => next());

  // GET /api/quota (anonymous and signed in)
  router.get('/api/quota', auth, quotaRoute);

  // POST /api/extract-text (screenshot OCR, its own rate limits, does not consume quota)
  router.post('/api/extract-text', extractLimiterMin, extractLimiterDay, handleExtractText);

  // POST /api/analyze (text analysis, optionalAuth, free-scan quota, separate rate limits)
  router.post(
    '/api/analyze',
    auth,
    quotaMiddleware,
    analyzeAnonLimiterMin,
    analyzeAnonLimiterDay,
    analyzeSignedInLimiterMin,
    analyzeSignedInLimiterDay,
    handleAnalyze
  );

  return router;
};

