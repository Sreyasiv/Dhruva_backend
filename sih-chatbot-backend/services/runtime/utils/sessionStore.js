// sessionStore.js
const { v4: uuidv4 } = require('uuid');

const sessions = new Map();

function ensureSession(sessionId) {
  let sid = sessionId;
  if (!sid) sid = 'sess-' + uuidv4();
  if (!sessions.has(sid)) {
    sessions.set(sid, { messages: [], createdAt: Date.now(), conversationId: uuidv4() });
  }
  return { sid, session: sessions.get(sid) };
}

function trimMessages(messages, maxTurns) {
  const maxMessages = maxTurns * 2;
  if (messages.length > maxMessages) return messages.slice(-maxMessages);
  return messages;
}

module.exports = { ensureSession, sessions, trimMessages };
