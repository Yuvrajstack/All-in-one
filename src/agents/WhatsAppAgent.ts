import { MemoryEngine } from '../memory/MemoryEngine'
import { PriorityEngine } from '../priority/PriorityEngine'
import { RAGPipeline } from '../rag/RAGPipeline'
import { CreateMemoryInput } from '../types'
import { groqClient, LLM_MODEL } from '../config/llm'

export interface RawWhatsAppMessage {
  from: string         // e.g. "+919876543210" or contact name
  senderName?: string  // e.g. "Alex"
  body: string         // message text
  date?: string
}

export class WhatsAppAgent {
  private memEngine = new MemoryEngine()
  private priority  = new PriorityEngine()
  private rag       = new RAGPipeline()

  async process(msg: RawWhatsAppMessage, userId: string, autoReply: boolean = true): Promise<string | null> {
    console.log(`💬 Processing WhatsApp message from ${msg.from} (${msg.senderName || 'Unknown'})...`)

    // 1. Extract memory units from the message
    const extracted = await this.extract(msg)
    console.log(`💬 Extracted ${extracted.length} memory elements from WhatsApp message`)

    for (const item of extracted) {
      const importance = this.priority.calculate({
        daysSinceCreated: 0,
        accessCount:      0,
        maxAccessCount:   1,
        emotionalWeight:  item.emotionalWeight || 0.6,
        source:           'whatsapp' as any
      })

      const input: CreateMemoryInput = {
        userId,
        type:      item.type || 'fact',
        content:   item.content,
        category:  item.category || 'general',
        source:    'whatsapp' as any,
        sourceRef: `${msg.senderName || msg.from}: ${msg.body.slice(0, 50)}`,
        importance,
        eventDate: item.eventDate ? new Date(item.eventDate) : undefined,
        dueDate:   item.dueDate   ? new Date(item.dueDate)   : undefined,
      }

      await this.memEngine.store(input)
    }

    // 2. Generate intelligent auto-reply using RAG & context if autoReply is enabled
    if (!autoReply) return null

    // Check allowed contacts whitelist if specified
    const allowed = (process.env.WHATSAPP_ALLOWED_CONTACTS || (global as any).whatsappAllowedContacts || '').trim()
    if (allowed && allowed !== '*') {
      const allowedItems = allowed.split(',').map((s: string) => s.trim()).filter(Boolean)
      const senderNameLower = (msg.senderName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const senderFromLower = (msg.from || '').toLowerCase()
      const senderFromDigits = senderFromLower.split('@')[0].replace(/\D/g, '')

      const isAllowed = allowedItems.some((item: string) => {
        const itemLower = item.toLowerCase()
        const itemClean = itemLower.replace(/[^a-z0-9]/g, '')
        const itemDigits = item.replace(/\D/g, '')

        // 1. Phone number match (stripping spaces, pluses, country codes, e.g. "+91 7505435369" vs "917505435369")
        if (itemDigits.length >= 7 && senderFromDigits.length >= 7) {
          if (senderFromDigits.includes(itemDigits) || itemDigits.includes(senderFromDigits) || senderFromDigits.endsWith(itemDigits.slice(-10))) {
            return true
          }
        }

        // 2. Normalized name or raw substring match
        if (itemClean && (senderNameLower.includes(itemClean) || itemClean.includes(senderNameLower) || senderFromLower.includes(itemLower))) {
          return true
        }

        // 3. Token match (e.g. "shivam" in "Satyam Shivam")
        const itemTokens = itemLower.split(/[\s,]+/).filter(t => t.length >= 3)
        const nameTokens = (msg.senderName || '').toLowerCase().split(/[\s,]+/)
        if (itemTokens.some(t => nameTokens.includes(t) || senderNameLower.includes(t))) {
          return true
        }

        return false
      })

      if (!isAllowed) {
        console.log(`ℹ️ WhatsApp Auto-Reply skipped: Contact "${msg.senderName || msg.from}" is not in the allowed contacts list [${allowed}].`)
        return null
      }
    }

    try {
      // Query RAG for context related to sender and message content
      const queryContext = `${msg.senderName || msg.from} asked: ${msg.body}`
      const ragContext = await this.rag.query(queryContext, userId)

      const prompt = `You are PAC (Personal AI Companion), an intelligent personal assistant acting on behalf of your user.
You received a personal WhatsApp message from "${msg.senderName || msg.from}".

Sender: ${msg.senderName || msg.from}
Message Received: "${msg.body}"

Relevant User Context (from user's Gmail, Calendar, GitHub, and Memory):
${ragContext}

Instructions:
1. Craft a sweet, warm, natural, and **ROMANTIC & CARING Hinglish** WhatsApp auto-reply (Hindi in Roman script with sweet affection, e.g., "Aww thank you! Main thoda busy hu abhi, shaam ko aapse acche se baat karta hu ❤️", "Haanji, aap batao kaise ho? Main bas thoda busy tha, miss you! ✨").
2. Keep the tone sweet, loving, warm, and romantic (1-2 sentences max).
3. If specific details (e.g. availability, schedule, or project status) are known from the user context, reference them accurately with a sweet caring vibe.
4. Do NOT include any intro/outro, quotes, or placeholder text. Return ONLY the final romantic Hinglish message to be sent.`

      let response: any
      const modelsToTry = [LLM_MODEL, 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']
      for (const modelName of modelsToTry) {
        try {
          response = await groqClient.chat.completions.create({
            model: modelName,
            messages: [{ role: 'user', content: prompt }]
          })
          if (response?.choices?.[0]?.message?.content) break
        } catch (err: any) {
          console.warn(`⚠️ Groq model ${modelName} call failed (${err.message}). Trying fallback...`)
        }
      }

      const replyText = response?.choices?.[0]?.message?.content?.trim() || null
      if (replyText) {
        // Store sent auto-reply as memory too
        const sentInput: CreateMemoryInput = {
          userId,
          type:      'fact',
          content:   `Sent WhatsApp Auto-Reply to ${msg.senderName || msg.from}: "${replyText}"`,
          category:  'general',
          source:    'whatsapp' as any,
          sourceRef: msg.from,
          importance: 0.5
        }
        await this.memEngine.store(sentInput)
      }

      return replyText
    } catch (err: any) {
      console.error('WhatsAppAgent: failed to generate auto reply:', err.message)
      return null
    }
  }

  private async extract(msg: RawWhatsAppMessage): Promise<any[]> {
    const prompt = `You are an AI assistant that extracts memories from WhatsApp chats.
Analyze this WhatsApp message and return a JSON object with memories array.

From: ${msg.senderName || msg.from} (${msg.from})
Message: ${msg.body}

Return ONLY a valid JSON object. No extra text or markdown formatting. Format:
{
  "memories": [
    {
      "type": "fact" | "task" | "event" | "project",
      "content": "detailed summary of fact, meeting request, task, or commitment",
      "category": "interview" | "deadline" | "report" | "general",
      "emotionalWeight": 0.6,
      "eventDate": null,
      "dueDate": null
    }
  ]
} `

    try {
      let response: any
      const modelsToTry = [LLM_MODEL, 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']
      for (const modelName of modelsToTry) {
        try {
          response = await groqClient.chat.completions.create({
            model: modelName,
            messages: [{ role: 'user', content: prompt }]
          })
          if (response?.choices?.[0]?.message?.content) break
        } catch (err: any) {
          // ignore extraction error on fallback
        }
      }

      const raw = response?.choices?.[0]?.message?.content || '{}'
      const jsonStart = raw.indexOf('{')
      const jsonEnd = raw.lastIndexOf('}')
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(raw.substring(jsonStart, jsonEnd + 1))
        return Array.isArray(parsed) ? parsed : parsed.memories || []
      }
      return []
    } catch (err: any) {
      console.error('WhatsAppAgent: extract error:', err.message)
      return [{
        type: 'fact',
        content: `WhatsApp message from ${msg.senderName || msg.from}: "${msg.body}"`,
        category: 'general',
        emotionalWeight: 0.5
      }]
    }
  }
}
