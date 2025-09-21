// admin.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

module.exports = (options) => {
  const INTERNAL_BASE = options.internalBase;
  const ADMIN_TOKEN = options.adminToken;
  const getLastInternalMeta = options.getLastInternalMeta;

  function requireAdmin(req, res, next) {
    if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
    next();
  }

  router.get('/status', requireAdmin, async (req, res) => {
    let pdfHash = getLastInternalMeta()?.pdfHash ?? null;
    let chunksCount = null;
    try {
      const r = await axios.post(`${INTERNAL_BASE}/internal/retrieve`, { q: '', topK: 0 }, { timeout: 5000 });
      pdfHash = r.data?.meta?.pdfHash ?? pdfHash;
      chunksCount = Array.isArray(r.data?.results) ? r.data.results.length : null;
    } catch (e) {
      // ignore
    }
    res.json({ pdfHash, chunksCount, uptimeSec: process.uptime(), lastReindex: getLastInternalMeta()?.createdAt ?? null });
  });

  router.post('/requestHuman', requireAdmin, (req, res) => {
    const { sessionId, reason } = req.body || {};
    // For MVP we log it; production: push to a queue / notify staff
    console.log('Manual human request', { sessionId, reason, at: Date.now() });
    res.json({ ok: true });
  });

  return router;
};
