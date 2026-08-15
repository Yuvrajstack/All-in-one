import OpenAI from 'openai'
import { config } from './index'

export const LLM_MODEL = config.groq.model

// High-fidelity Mock LLM Client
class MockLLMCompletions {
  async create(params: any): Promise<any> {
    const messages = params.messages || []
    const systemMsg = messages.find((m: any) => m.role === 'system')?.content || ''
    const userMsg = messages.find((m: any) => m.role === 'user')?.content || ''
    const fullPrompt = `${systemMsg}\n\n${userMsg}`

    // 1. EmailAgent - Extract memories from email
    if (fullPrompt.includes('extract memories from emails') || fullPrompt.includes('JSON object with memories array')) {
      let content = 'Fact extracted from email'
      let type = 'fact'
      let category = 'general'
      let dateField: any = null
      let dateVal: any = null

      if (userMsg.includes('amazon.com') && userMsg.includes('Online Assessment')) {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                memories: [{
                  type: 'task',
                  content: 'Complete Amazon SDE-1 Online Assessment.',
                  category: 'deadline',
                  emotionalWeight: 0.85,
                  eventDate: null,
                  dueDate: '2026-07-15T23:59:00.000Z'
                }]
              })
            }
          }]
        }
      }

      if (userMsg.includes('google.com') && userMsg.includes('Interview Invitation')) {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                memories: [{
                  type: 'event',
                  content: 'Technical Interview with Google.',
                  category: 'interview',
                  emotionalWeight: 0.90,
                  eventDate: '2026-07-10T15:00:00.000Z',
                  dueDate: null
                }]
              })
            }
          }]
        }
      }

      if (userMsg.includes('shipping') || userMsg.includes('order')) {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                memories: [{
                  type: 'fact',
                  content: 'Amazon order of Mechanical Keyboard shipped, expected delivery July 15th.',
                  category: 'general',
                  emotionalWeight: 0.60,
                  eventDate: '2026-07-15T12:00:00.000Z',
                  dueDate: null
                }]
              })
            }
          }]
        }
      }

      // Generic email fallback
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              memories: [{
                type: 'fact',
                content: `Processed email: "${userMsg.slice(0, 100)}..."`,
                category: 'general',
                emotionalWeight: 0.5,
                eventDate: null,
                dueDate: null
              }]
            })
          }
        }]
      }
    }

    // 2. JobAgent - Extract job applications
    if (fullPrompt.includes('extract job application information')) {
      if (userMsg.includes('amazon.com')) {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                isJobEmail: true,
                company: 'Amazon',
                role: 'SDE-1',
                status: 'oa',
                memories: [{
                  type: 'task',
                  content: 'Complete Amazon SDE-1 Online Assessment by July 15th.',
                  category: 'deadline',
                  emotionalWeight: 0.85,
                  eventDate: null,
                  dueDate: '2026-07-15T23:59:00.000Z'
                }]
              })
            }
          }]
        }
      }

      if (userMsg.includes('google.com')) {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                isJobEmail: true,
                company: 'Google',
                role: 'Software Engineer',
                status: 'interview',
                memories: [{
                  type: 'event',
                  content: 'Technical Interview with Google.',
                  category: 'interview',
                  emotionalWeight: 0.90,
                  eventDate: '2026-07-10T15:00:00.000Z',
                  dueDate: null
                }]
              })
            }
          }]
        }
      }

      return {
        choices: [{
          message: {
            content: JSON.stringify({ isJobEmail: false })
          }
        }]
      }
    }

    // 3. PlannerAgent - Daily briefing
    if (systemMsg.includes('morning briefing') || userMsg.includes('morning briefing')) {
      return {
        choices: [{
          message: {
            content: `🚨 **ALERTS**
- **Amazon SDE-1 Online Assessment** is due by **July 15th at 11:59 PM**.
- **Google Software Engineer Interview** is scheduled for **July 10th at 3:00 PM**.

✅ **TASKS**
- Complete Amazon SDE-1 Online Assessment (90 minutes).
- Review GitHub PR: "feat: memory classification with Neo4j" in \`akansh/pac-agent-engine\`.

📅 **EVENTS**
- **System Design Interview — Google** on July 10th at 3:00 PM IST (Link: https://meet.google.com/abc-xyz).

💡 **INSIGHTS**
- You met **John from Microsoft** today. He is the Engineering Manager for the Azure team and mentioned they are hiring. Consider reaching out!
- Your Amazon package containing **Mechanical Keyboard (Cherry MX Brown)** is arriving on **July 15th**.`
          }
        }]
      }
    }

    // 4. RelationshipAgent - Profile summary
    if (fullPrompt.includes('build relationship profiles') || fullPrompt.includes('JSON profile')) {
      const name = userMsg.includes('John') ? 'John' : 'Someone'
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              name: name,
              role: name === 'John' ? 'Engineering Manager' : 'Recruiter',
              company: name === 'John' ? 'Microsoft' : 'Unknown',
              howWemet: name === 'John' ? 'Met at a local tech meetup / interaction' : 'Via email',
              lastInteraction: 'Today',
              pendingCommitments: name === 'John' ? ['Follow up on Azure backend hiring'] : [],
              summary: name === 'John' 
                ? 'Engineering Manager for the Azure team at Microsoft. Very helpful, mentioned they are active hiring backend engineers.' 
                : 'Professional contact.'
            })
          }
        }]
      }
    }

    // 5. ContextEngine / RAG Questions
    if (systemMsg.includes('personal AI companion') || systemMsg.includes('cite sources') || userMsg.includes('=== MEMORIES ===')) {
      const contextText = userMsg.split('Question:')[0] || ''
      const cleanedContext = contextText.replace('=== MEMORIES ===', '').trim()

      if (!cleanedContext || cleanedContext.includes('no memories') || cleanedContext.length < 10) {
        return {
          choices: [{
            message: {
              content: `I reviewed your database and synced sources, but I couldn't find any memories or records yet. 

Try going to the **Connected Sources** tab and clicking **Sync Mails** or **Sync Repos** to fetch your live data!`
            }
          }]
        }
      }

      const memoryBlocks = cleanedContext.split('[MEMORY').slice(1)
      let summary = `I reviewed your synced memories and found the following relevant details:\n\n`
      
      memoryBlocks.forEach((block) => {
        const lines = block.split('\n').map(l => l.trim())
        const typeLine = lines.find(l => l.startsWith('type:'))?.replace('type:', '').trim() || ''
        const sourceLine = lines.find(l => l.startsWith('source:'))?.replace('source:', '').trim() || ''
        const contentLine = lines.find(l => l.startsWith('content:'))?.replace('content:', '').trim() || ''
        
        if (contentLine) {
          summary += `- **${contentLine}** (Source: ${sourceLine.toUpperCase()} / Type: ${typeLine})\n`
        }
      })
      
      return {
        choices: [{
          message: {
            content: summary
          }
        }]
      }
    }

    // Default fallback
    return {
      choices: [{
        message: {
          content: 'Mock response generated. No active LLM API key configured.'
        }
      }]
    }
  }
}

class MockLLMClient {
  chat = {
    completions: new MockLLMCompletions()
  }
}

// Export real client or mock client transparently
let clientInstance: any

if (config.groq.apiKey) {
  console.log('🚀 Using real Groq LLM client instance')
  clientInstance = new OpenAI({
    apiKey:  config.groq.apiKey,
    baseURL: config.groq.baseURL,
  })
} else {
  console.warn('⚠️ No GROQ_API_KEY configured. Using In-Memory Mock LLM client fallback.')
  clientInstance = new MockLLMClient()
}

export const groqClient = clientInstance