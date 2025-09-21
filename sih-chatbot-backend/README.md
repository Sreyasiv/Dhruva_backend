sih-chatbot-backend/
├── .env.example
├── package.json
├── README.md
├── services/
│   ├── sreya-service/          # Data & Model Layer (PDF, retriever, llm-proxy, reindex)
│   │   ├── package.json
│   │   ├── index.js
│   │   ├── parser.js
│   │   ├── retriever.js
│   │   ├── llmProxy.js
│   │   ├── cache/
│   │   │   ├── chunks.json
│   │   │   └── meta.json
│   │   └── assets/
│   │       └── knowledge.pdf
│   └── guru-runtime/           # Runtime Chat & Context Layer (sessions, /chat)
│       ├── package.json
│       ├── server.js
│       ├── routes/
│       │   └── admin.js
│       └── utils/
│           └── sessionStore.js
└── dev-scripts/
    └── start-all.sh
