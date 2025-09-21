// server.js (runtime)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ensureSession, trimMessages } = require('./utils/sessionStore');
const createAdminRoutes = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const INTERNAL_BASE = process.env.INTERNAL_BASE_URL || 'http://localhost:4001';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'super-secret-admin-token';
const HUMAN_CONTACT = process.env.HUMAN_CONTACT || 'staff@sihchatbot.com';
const SESSION_MAX_TURNS = parseInt(process.env.SESSION_MAX_TURNS || '6', 10);
const RETRIEVAL_CONFIDENCE_THRESHOLD = parseFloat(process.env.RETRIEVAL_CONFIDENCE_THRESHOLD || '0.25');

let lastInternalMeta = null;

function containsUncertainPhrase(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const patterns = [
    "i don't know", "i am not sure", "i’m not sure", "not sure", "cannot answer", "cannot find", "no information",
    "mujhe pata nahi", "pata nahi", "मुझे पता नहीं", "मुझे नहीं पता", "sorry, i don't"
  ];
  return patterns.some(p => lower.includes(p));
}

function extractLLMText(llmResp) {
  if (!llmResp) return '';
  let payload = llmResp.data ?? llmResp;
  if (typeof payload === 'string') return payload;
  if (payload.choices?.[0]?.message?.content) return payload.choices[0].message.content;
  if (payload.reply) return payload.reply;
  try { return JSON.stringify(payload).slice(0,1000); } catch { return ''; }
}

app.post('/chat', async (req, res) => {
  try {
    const { message, lang = 'en-US', sessionId } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });

    const { sid, session } = ensureSession(sessionId);

    // call retriever
    let retrieveResults = [];
    try {
      const r = await axios.post(`${INTERNAL_BASE}/internal/retrieve`, { q: message, topK: 3 }, { timeout: 8000 });
      retrieveResults = r.data?.results ?? [];
      lastInternalMeta = r.data?.meta ?? lastInternalMeta;
    } catch (e) {
      console.warn('retriever call failed', e.message || e.toString());
    }

    const topScore = retrieveResults[0]?.score ?? 0;
    let needsHuman = topScore < RETRIEVAL_CONFIDENCE_THRESHOLD;

    // system prompt: only use retrieved chunks
    const ctx = retrieveResults.length ? retrieveResults.map(c => `[[${c.id}]] ${c.text}`).join('\n\n') : '<<no context>>';
    const systemPrompt = `You are an assistant. Answer using ONLY the context below. Do NOT hallucinate. If answer not present, say "I don't know." in the same language as the user (lang=${lang}).\n\nContext:\n${ctx}`;

    const messagesForLLM = [{ role: 'system', content: systemPrompt }];
    for (const m of session.messages) messagesForLLM.push({ role: m.role, content: m.text });
    messagesForLLM.push({ role: 'user', content: message });

    // call llm proxy
    let llmResp;
    try {
      const r = await axios.post(`${INTERNAL_BASE}/internal/llm`, { messages: messagesForLLM }, { timeout: 15000 });
      llmResp = r;
    } catch (e) {
      console.error('LLM proxy error', e.message || e.toString());
      return res.status(502).json({ error: 'LLM proxy failed' });
    }

    const replyText = extractLLMText(llmResp);

    if (containsUncertainPhrase(replyText)) needsHuman = true;

    // save history
    session.messages.push({ role: 'user', text: message, at: Date.now() });
    session.messages.push({ role: 'assistant', text: replyText, at: Date.now() });
    session.messages = trimMessages(session.messages, SESSION_MAX_TURNS);

    res.json({
      reply_text: replyText,
      needsHuman,
      contactInfo: needsHuman ? (process.env.HUMAN_CONTACT || HUMAN_CONTACT) : null,
      conversationId: session.conversationId,
      usedChunks: retrieveResults.map(r => ({ id: r.id, score: r.score })),
      meta: lastInternalMeta ?? null,
      sessionId: sid
    });

  } catch (e) {
    console.error('chat error', e);
    res.status(500).json({ error: 'internal server error' });
  }
});

app.use('/admin', createAdminRoutes({
  internalBase: INTERNAL_BASE,
  adminToken: ADMIN_TOKEN,
  getLastInternalMeta: () => lastInternalMeta
}));

app.listen(PORT, () => console.log(`runtime listening on ${PORT}, internal=${INTERNAL_BASE}`));
