import { MemoryEngine } from '../memory/MemoryEngine'
import { PriorityEngine } from '../priority/PriorityEngine'
import { CreateMemoryInput } from '../types'
import { groqClient, LLM_MODEL } from '../config/llm'

interface DeliveryEmail {
  from:    string
  subject: string
  body:    string
  date:    string
}

export class DeliveryAgent {
  private memEngine = new MemoryEngine()
  private priority  = new PriorityEngine()

  // ─── MAIN PROCESS ────────────────────────────────────────
  async process(email: DeliveryEmail, userId: string): Promise<void> {
    console.log('🚚 DeliveryAgent processing email...')
    const extracted = await this.extract(email)

    if (!extracted) {
      console.log('🚚 Not a delivery email, skipping')
      return
    }

    console.log(`🚚 Delivery: ${extracted.item} | ${extracted.status} | ${extracted.platform}`)

    for (const item of extracted.memories) {
      const importance = this.priority.calculate({
        daysSinceCreated: 0,
        accessCount:      0,
        maxAccessCount:   1,
        emotionalWeight:  0.5,
        source:           'gmail'
      })

      const input: CreateMemoryInput = {
        userId,
        type:      item.type,
        content:   item.content,
        category:  item.category || 'general',
        source:    'gmail',
        sourceRef: email.from,
        importance,
        eventDate: item.eventDate ? new Date(item.eventDate) : undefined,
        dueDate:   item.dueDate   ? new Date(item.dueDate)   : undefined,
      }

      await this.memEngine.store(input)
    }
  }

  // ─── EXTRACT DELIVERY INFO ────────────────────────────────
  private async extract(email: DeliveryEmail): Promise<any | null> {
    const prompt = `
You are an AI that extracts delivery and order information from emails.
Analyze this email and return a JSON object.

Email:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Body: ${email.body}

If this is NOT a delivery/order/bill email, return: { "isDeliveryEmail": false }

If it IS a delivery email, return:
{
  "isDeliveryEmail": true,
  "platform": "Amazon" | "Flipkart" | "Swiggy" | "Zomato" | "other",
  "item": "what was ordered",
  "status": "ordered" | "shipped" | "out_for_delivery" | "delivered" | "bill_due",
  "trackingUrl": "tracking URL if present or null",
  "memories": [
    {
      "type": "fact" | "task" | "event",
      "content": "clear description",
      "category": "general" | "deadline",
      "emotionalWeight": 0.4,
      "eventDate": "expected delivery date ISO or null",
      "dueDate": "bill due date ISO or null"
    }
  ]
}

Return ONLY valid JSON. No extra text.`

    console.log('🚚 Calling Groq API...')
    const response = await groqClient.chat.completions.create({
      model:    LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })
    console.log('🚚 Groq responded!')
    const raw     = response.choices[0].message.content || '{}'
// add this
const cleaned = raw.replace(/```json|```/g, '').trim()
   

    try {
      const parsed = JSON.parse(cleaned)
      if (!parsed.isDeliveryEmail) return null
      return parsed
    } catch {
      console.error('DeliveryAgent: failed to parse', raw)
      return null
    }
  }
}