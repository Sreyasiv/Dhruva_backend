# Backend Development Plan — PDF-backed Multilingual Voice Chatbot (MVP)

This document defines the **MVP backend responsibilities** for two developers:

- **Person 1 — Sreya** (Data & Model Layer)  
- **Person 2 — Guru** (Runtime Chat & Context Layer)  

The chatbot will:  
- Answer queries from a **7-page PDF knowledge base**.  
- Support **multi-turn context** (resets on browser refresh).  
- Provide both **text + voice reply** (voice handled by frontend TTS).  
- Reply in the **same language** as the user’s query.  
- Trigger **human fallback** with staff contact info when confidence is low.  
- Exclude WhatsApp integration (not part of MVP).  

---

## 📂 Architecture Overview

**Flow:**  
1. User speaks/types in browser → browser STT (speech → text).  
2. Frontend sends `{ message, lang, sessionId }` to `/chat`.  
3. Backend runtime (Guru) calls:  
   - `/internal/retrieve` (Sreya’s retriever service).  
   - `/internal/llm` (Sreya’s LLM proxy).  
4. LLM reply processed → backend returns `{ reply_text, needsHuman, contactInfo }`.  
5. Browser displays text and uses built-in **speechSynthesis** for voice output.  

---

## 🧑‍💻 Person 1 — Sreya (Data & Model Layer)

**Main Goal:** Handle **PDF ingestion**, **retrieval**, and **LLM proxying**. Provide reliable services for Guru to consume.

### Tasks

1. **PDF Parsing & Chunking**
   - Input: `assets/knowledge.pdf` (≤7 pages).  
   - Extract plain text, split into chunks (500–1200 characters with overlap).  
   - Save to `cache/chunks.json` with fields: `{ id, text, pageStart, pageEnd }`.  
   - Save metadata to `cache/meta.json`: `{ pdfHash, createdAt }`.

2. **Retriever Service**
   - MVP: implement **keyword-based chunk scoring** (fast, simple).  
   - Optional (if time permits): generate embeddings (via OpenRouter) once and store in `cache/embeddings.json`.  
   - Expose endpoint:  
     - `POST /internal/retrieve`  
     - Request: `{ q:"query", topK:3 }`  
     - Response: `{ results:[{ id, text, score }], meta:{ pdfHash } }`

3. **LLM Proxy**
   - Expose endpoint:  
     - `POST /internal/llm`  
     - Request: `{ messages:[{role,content}], model? }`  
     - Calls OpenRouter with stored API key.  
     - Returns raw LLM response JSON.  
   - Centralizes API key use (keeps it out of Guru’s code).

4. **Admin Reindex**
   - Endpoint: `POST /admin/reindex` (protected by a simple token in env).  
   - Re-runs parsing/embedding, replaces cache files.  
   - Response: `{ pdfHash, chunksCount }`.

5. **Mocks for Parallel Dev**
   - Provide mock responses for `/internal/retrieve` and `/internal/llm` so Guru can integrate before final version is ready.

### Deliverables
- `cache/chunks.json`, `cache/meta.json`  
- (Optional) `cache/embeddings.json`  
- Endpoints: `/internal/retrieve`, `/internal/llm`, `/admin/reindex`  
- README notes on how to run PDF parsing and what mock endpoints return.

---

## 🧑‍💻 Person 2 — Guru (Runtime Chat & Context Layer)

**Main Goal:** Implement the **public chat endpoint**, manage sessions/context, apply fallback logic, and serve results to the frontend.

### Tasks

1. **Session Management**
   - In-memory map: `sessions[sessionId] = { messages:[{ role, text }], createdAt }`.  
   - Keep last N turns (~6) for context.  
   - Reset when page refreshes (new sessionId from frontend).

2. **Public Chat Endpoint**
   - Endpoint: `POST /chat`  
   - Request: `{ message:"...", lang:"hi-IN", sessionId:"sess-123" }`  
   - Flow:  
     1. Call `/internal/retrieve` → get top chunks.  
     2. Build system prompt:  
        - Must use **only retrieved chunks**.  
        - Must reply in **same language** as `lang`.  
     3. Assemble messages: system + session history + user message.  
     4. Call `/internal/llm`.  
     5. Parse reply, check confidence (see below).  
     6. Save reply in session history.  
     7. Respond with:  
        ```json
        {
          "reply_text":"...",
          "needsHuman":false,
          "contactInfo":null,
          "conversationId":"conv-123",
          "usedChunks":[{id,score}]
        }
        ```

3. **Confidence Heuristic**
   - If top retrieval score < 0.25 → `needsHuman = true`.  
   - If reply contains “I’m not sure / I don’t know” → `needsHuman = true`.  
   - Otherwise → normal reply.  
   - On fallback, include `contactInfo` from env.

4. **Voice Handling**
   - No backend TTS for MVP.  
   - Return `reply_text` and `lang`.  
   - Frontend will handle voice with `speechSynthesis`.  

5. **Admin Endpoints**
   - `GET /admin/status` → `{ pdfHash, chunksCount, uptime, lastReindex }`.  
   - `POST /admin/requestHuman` → logs a manual human-help request.

### Deliverables
- Public `/chat` endpoint  
- Session store in memory  
- Confidence/fallback logic  
- Admin endpoints for status + human request  
- Integration with Sreya’s `/internal/retrieve` + `/internal/llm`  

---


