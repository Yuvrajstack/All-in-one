import { RAGPipeline } from '../rag/RAGPipeline'
import { PlannerAgent } from './PlannerAgent'
import { RelationshipAgent } from './RelationshipAgent'
import { ExperienceAgent } from './ExperienceAgent'
import { MemoryOptimizer } from '../memory/MemoryOptimizer'
import { groqClient, LLM_MODEL } from '../config/llm'

type AgentType = 'planner' | 'rag' | 'relationship' | 'experience' | 'document' | 'delivery' | 'optimize' | 'action'

export class MasterAgent {
  private rag       = new RAGPipeline()
  private planner   = new PlannerAgent()
  private relationship = new RelationshipAgent()
  private experience   = new ExperienceAgent()
  private optimizer    = new MemoryOptimizer()

  async query(userQuery: string, userId: string): Promise<string> {
    console.log(`MasterAgent received query: "${userQuery}"`)

    const agent = this.route(userQuery)
    console.log(`MasterAgent routing to: ${agent}`)

    switch (agent) {
      case 'planner':
        return await this.planner.generateDailyBriefing(userId)

      case 'relationship':
        const name = this.extractName(userQuery)
        return await this.relationship.buildProfile(name, userId)

      case 'experience':
        return await this.experience.analyzePatterns(userId)

      case 'optimize':
        await this.optimizer.optimize(userId)
        return '🔧 Memory optimization complete! Duplicates removed, old memories forgotten and summarized.'

      case 'action':
        return await this.handleAction(userQuery, userId)

      case 'document':
      case 'delivery':
      case 'rag':
      default:
        return await this.rag.query(userQuery, userId)
    }
  }

  private route(query: string): AgentType {
    const q = query.toLowerCase()

    const actionKeywords = [
      'send email', 'email to', 'email hr', 'email recruiting', 'send an email',
      'create a pr', 'do a pr', 'create pull request', 'open a pr', 'create pull-request',
      'create an issue', 'create issue', 'open an issue',
      'send whatsapp', 'whatsapp to', 'send a whatsapp', 'message on whatsapp'
    ]

    const plannerKeywords = [
      'today', 'briefing', 'plan', 'what should i do',
      'morning', 'daily', 'prioritize', 'what should i know'
    ]

    const relationshipKeywords = [
      'who is',
      'what do i know about',
      'relationship with',
      'what do i owe',
      'committed to'
    ]

    const experienceKeywords = [
      'pattern', 'habit', 'behavior', 'tendency',
      'analyze me', 'what do i usually', 'my style',
      'insights about me', 'how do i work'
    ]

    const documentKeywords = [
      'my resume', 'my skills', 'my experience',
      'my projects', 'what did i build',
      'my background', 'tell me about my'
    ]

    const deliveryKeywords = [
      'delivery', 'order', 'package', 'shipping',
      'arriving', 'keyboard', 'amazon', 'flipkart',
      'track', 'shipment', 'bill', 'due'
    ]

    const optimizeKeywords = [
      'optimize memory', 'clean memory', 'remove duplicates',
      'forget old', 'summarize memories', 'cleanup'
    ]

    if (actionKeywords.some(k => q.includes(k)))       return 'action'
    if (plannerKeywords.some(k => q.includes(k)))      return 'planner'
    if (relationshipKeywords.some(k => q.includes(k))) return 'relationship'
    if (experienceKeywords.some(k => q.includes(k)))   return 'experience'
    if (documentKeywords.some(k => q.includes(k)))     return 'document'
    if (deliveryKeywords.some(k => q.includes(k)))     return 'delivery'
    if (optimizeKeywords.some(k => q.includes(k)))     return 'optimize'

    return 'rag'
  }

  private async handleAction(userQuery: string, userId: string): Promise<string> {
    const prompt = `You are a helper that extracts action commands from user prompts.
Analyze the user query: "${userQuery}"

Supported actions:
1. GMAIL_SEND: { to: "email", subject: "subject", body: "body" }
2. GITHUB_ISSUE: { repo: "owner/repo", title: "issue title", body: "issue body" }
3. GITHUB_PR: { repo: "owner/repo", title: "PR title", head: "branch_name", base: "main", body: "PR body" }
4. WHATSAPP_SEND: { to: "phone number or contact name", message: "message content" }

Respond ONLY with a valid JSON object of the format:
{
  "command": "GMAIL_SEND" | "GITHUB_ISSUE" | "GITHUB_PR" | "WHATSAPP_SEND" | "UNKNOWN",
  "params": { ... }
}
Do not write any other explanation or markdown blocks.`

    try {
      const response = await groqClient.chat.completions.create({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.choices[0].message.content || '{}'
      const jsonStart = text.indexOf('{')
      const jsonEnd = text.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON block found in LLM response')
      const data = JSON.parse(text.substring(jsonStart, jsonEnd + 1))

      const axios = require('axios')
      const port = process.env.PORT || '4000'

      if (data.command === 'GMAIL_SEND') {
        const { to, subject, body } = data.params
        await axios.post(`http://localhost:${port}/api/actions/email/send`, { to, subject, body })
        return `✉️ Sent email successfully to **${to}** with subject *"${subject}"*!`
      }

      if (data.command === 'GITHUB_ISSUE') {
        const { repo, title, body } = data.params
        await axios.post(`http://localhost:${port}/api/actions/github/issue`, { repo, title, body })
        return `🐙 Created GitHub issue successfully in **${repo}** titled *"${title}"*!`
      }

      if (data.command === 'GITHUB_PR') {
        const { repo, title, body, head, base } = data.params
        await axios.post(`http://localhost:${port}/api/actions/github/pr`, { repo, title, body, head, base })
        return `🐙 Created Pull Request successfully in **${repo}**: *"${title}"*!`
      }

      if (data.command === 'WHATSAPP_SEND') {
        const { to, message } = data.params
        await axios.post(`http://localhost:${port}/api/actions/whatsapp/send`, { to, message })
        return `💬 Sent WhatsApp message successfully to **${to}**: *"${message}"*!`
      }
    } catch (err: any) {
      console.error('Action parsing/execution error:', err.message)
      return `❌ Could not execute action. Error: ${err.message}`
    }

    return '❓ I did not understand which action you wanted me to take.'
  }

  private extractName(query: string): string {
    const q = query.toLowerCase()
    const cleaned = q
      .replace('who is', '')
      .replace('what do i know about', '')
      .replace('relationship with', '')
      .replace('what do i owe', '')
      .replace('committed to', '')
      .trim()
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }
}