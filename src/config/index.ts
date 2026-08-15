import dotenv from 'dotenv'
dotenv.config()

export const config = {
  postgres: {
    host:     process.env.POSTGRES_HOST     || 'localhost',
    port:     parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB       || 'pac_db',
    user:     process.env.POSTGRES_USER     || 'pac_user',
    password: process.env.POSTGRES_PASSWORD || '',
  },
  qdrant: {
    host: process.env.QDRANT_HOST || 'localhost',
    port: parseInt(process.env.QDRANT_PORT || '6333'),
  },
  groq: {
    apiKey:  process.env.GROQ_API_KEY || '',
    baseURL: 'https://api.groq.com/openai/v1',
    model:   'llama-3.1-8b-instant'
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  huggingface: {
    apiKey: process.env.HF_API_KEY || '',
  },
  app: {
    port: parseInt(process.env.PORT || '4000'),
    env:  process.env.NODE_ENV || 'development',
  }
}