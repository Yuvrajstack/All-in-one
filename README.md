# PAC — Agent Engine & Memory Infrastructure

> Phase 1 of Personal AI Companion (Project Lulu)

## What this module owns
- Memory System (Postgres + Qdrant)
- Master Agent + Email, Project, Planner Agents
- Priority Engine (importance scoring)
- RAG Pipeline (semantic search + cited answers)

## Tech Stack
- Node.js + TypeScript
- PostgreSQL (structured memory storage)
- Qdrant (vector/semantic search)
- Groq API (LLM — llama-3.3-70b-versatile)
- Docker (local database setup)

## Folder Structure
src/
├── agents/          → MasterAgent, EmailAgent, ProjectAgent, PlannerAgent
├── memory/          → MemoryEngine, MemoryRepository (PG), VectorRepository (Qdrant)
├── priority/        → PriorityEngine — importance scoring formula
├── rag/             → EmbeddingService, RAGPipeline
├── db/              → Postgres pool, Qdrant client, SQL migrations
├── types/           → All TypeScript interfaces
├── config/          → Environment config + LLM clients
└── index.ts         → Entry point

## Setup

### 1. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/pac-agent-engine
cd pac-agent-engine
npm install
```

### 2. Environment variables
```bash
cp .env.example .env
# fill in your keys
```

Required keys:
- `GROQ_API_KEY` → get from console.groq.com (free)
- `POSTGRES_*` → handled by Docker
- `QDRANT_*` → handled by Docker

### 3. Start databases
```bash
# make sure Docker Desktop is running
docker-compose up -d
```

### 4. Run migrations
```bash
docker exec -i pac-infra-postgres-1 psql -U pac_user -d pac_db < src/db/migrations/001_init_schema.sql
```

### 5. Run
```bash
npm run dev
```

## How it works
Email/GitHub data comes in
↓
EmailAgent / ProjectAgent
extracts memories using Groq LLM
↓
PriorityEngine
scores each memory (0.0 - 1.0)
↓
MemoryEngine
saves to Postgres + Qdrant
↓
User asks a question
↓
MasterAgent → RAGPipeline
searches relevant memories
feeds to Groq LLM with context
↓
Answer with citations
