import axios from 'axios'
import { config } from './index'

const HF_API_URL = 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2'

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await axios.post(
    HF_API_URL,
    { inputs: text },
    {
      headers: {
        Authorization: `Bearer ${config.huggingface.apiKey}`,
        'Content-Type': 'application/json',
      }
    }
  )
  return response.data
}