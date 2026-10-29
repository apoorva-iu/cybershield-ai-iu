'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  createOrder,
  verifyOrderPayment,
  processWebhook,
  getBillingStatus,
  isPaymentsAvailable
} = require('./service');

const billingLimiter = rateLimit({
  windowMs: 60000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ error: 'Too many requests. Please try again in a minute.' })
});

module.exports = function createBillingRouter(requireAuthMiddleware) {
  const router = express.Router();
  const requireAuth = requireAuthMiddleware || ((req, res, next) => next());

  // Webhook handler (mounted with raw body parser for this route only)
  router.post(
    '/api/billing/webhook',
    express.raw({ type: '*/*' }),
    async (req, res) => {
      try {
        const signatureHeader = req.headers['x-razorpay-signature'];
        const result = await processWebhook({
          rawBody: req.body,
          signatureHeader
        });
        return res.status(200).json(result);
      } catch (err) {
        if (err.code === 'PAYMENTS_UNAVAILABLE') {
          return res.status(503).json({ error: 'payments_unavailable' });
        }
        if (err.code === 'INVALID_SIGNATURE') {
          return res.status(400).json({ error: 'invalid_signature' });
        }
        if (err.code === 'INVALID_JSON') {
          return res.status(400).json({ error: 'invalid_json' });
        }
        console.error('[billing] webhook processing error:', err.message);
        return res.status(500).json({ error: 'Webhook processing error' });
      }
    }
  );

  // POST /api/billing/create-order
  router.post(
    '/api/billing/create-order',
    requireAuth,
    billingLimiter,
    async (req, res) => {
      if (!isPaymentsAvailable()) {
        return res.status(503).json({ error: 'payments_unavailable' });
      }

      try {
        const orderData = await createOrder(req.user.id);
        return res.json(orderData);
      } catch (err) {
        if (err.code === 'PAYMENTS_UNAVAILABLE') {
          return res.status(503).json({ error: 'payments_unavailable' });
        }
        console.error('[billing] create-order error:', err.message);
        return res.status(500).json({ error: 'Could not create payment order: ' + err.message });
      }
    }
  );

  // POST /api/billing/verify
  router.post(
    '/api/billing/verify',
    requireAuth,
    billingLimiter,
    async (req, res) => {
      if (!isPaymentsAvailable()) {
        return res.status(503).json({ error: 'payments_unavailable' });
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

      try {
        const result = await verifyOrderPayment({
          userId: req.user.id,
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          signature: razorpay_signature
        });
        return res.json(result);
      } catch (err) {
        if (err.code === 'PAYMENTS_UNAVAILABLE') {
          return res.status(503).json({ error: 'payments_unavailable' });
        }
        if (err.code === 'FORBIDDEN') {
          return res.status(403).json({ error: 'forbidden' });
        }
        if (err.code === 'INVALID_SIGNATURE') {
          return res.status(400).json({ error: 'invalid_signature' });
        }
        if (err.code === 'NOT_FOUND') {
          return res.status(404).json({ error: 'order_not_found' });
        }
        if (err.code === 'INVALID_REQUEST') {
          return res.status(400).json({ error: 'invalid_request', message: err.message });
        }
        console.error('[billing] verify error:', err.message);
        return res.status(500).json({ error: 'Payment verification failed: ' + err.message });
      }
    }
  );

  // GET /api/billing/status
  router.get(
    '/api/billing/status',
    requireAuth,
    billingLimiter,
    async (req, res) => {
      try {
        const status = await getBillingStatus(req.user.id, req, res);
        return res.json(status);
      } catch (err) {
        console.error('[billing] status error:', err.message);
        return res.status(500).json({ error: 'Could not retrieve billing status' });
      }
    }
  );

  return router;
};

