import { EmailAgent } from '../agents/EmailAgent'
import { CalendarAgent } from '../agents/CalendarAgent'
import { ProjectAgent } from '../agents/ProjectAgent'
import { JobAgent } from '../agents/JobAgent'
import { FactsAgent } from '../agents/FactsAgent'
import { DocumentAgent } from '../agents/DocumentAgent'
import { DeliveryAgent } from '../agents/DeliveryAgent'
import { WhatsAppAgent } from '../agents/WhatsAppAgent'

// ─── INGESTION EVENT TYPE ─────────────────────────────────
export interface IngestionEvent {
  source: 'gmail' | 'calendar' | 'github' | 'job' | 'manual' | 'document' | 'delivery' | 'whatsapp'
  type:   'email' | 'event' | 'push' | 'pr' | 'job_email' | 'text' | 'pdf' | 'markdown' | 'delivery_email' | 'whatsapp_message' | 'project' | 'fact'
  userId: string
  data:   any
}

export class IngestionPipeline {
  private emailAgent    = new EmailAgent()
  private calendarAgent = new CalendarAgent()
  private projectAgent  = new ProjectAgent()
  private jobAgent      = new JobAgent()
  private factsAgent    = new FactsAgent()
  private documentAgent = new DocumentAgent()
  private deliveryAgent = new DeliveryAgent()
  private whatsappAgent = new WhatsAppAgent()

  async ingest(event: IngestionEvent): Promise<void> {
    console.log(`📥 Ingesting: source=${event.source} type=${event.type}`)
    const normalized = this.normalize(event)
    await this.route(normalized)
    console.log(`📥 Ingestion complete: source=${event.source}`)
  }

  private normalize(event: IngestionEvent): IngestionEvent {
    switch (event.source) {
      case 'gmail':
      case 'job':
      case 'delivery':
        return {
          ...event,
          data: {
            from:    event.data.from?.trim()    || '',
            subject: event.data.subject?.trim() || '',
            body:    event.data.body?.trim()    || '',
            date:    event.data.date            || new Date().toISOString(),
          }
        }

      case 'whatsapp':
        return {
          ...event,
          data: {
            from:       event.data.from?.trim()       || '',
            senderName: event.data.senderName?.trim() || event.data.from?.trim() || '',
            body:       event.data.body?.trim()       || '',
            date:       event.data.date               || new Date().toISOString(),
          }
        }

      case 'calendar':
        return {
          ...event,
          data: {
            title:           event.data.title?.trim()       || '',
            description:     event.data.description?.trim() || '',
            date:            event.data.date                || new Date().toISOString(),
            attendees:       event.data.attendees           || [],
            location:        event.data.location            || '',
            durationMinutes: event.data.durationMinutes     || 60,
          }
        }

      case 'github':
        return {
          ...event,
          data: {
            type:   event.data.type   || '',
            repo:   event.data.repo   || '',
            action: event.data.action || '',
            title:  event.data.title  || '',
            date:   event.data.date   || new Date().toISOString(),
          }
        }

      case 'manual':
        return {
          ...event,
          data: {
            text: event.data.text?.trim() || '',
            date: event.data.date         || new Date().toISOString(),
          }
        }

      case 'document':
        return {
          ...event,
          data: {
            title:   event.data.title?.trim()   || 'document',
            content: event.data.content?.trim() || '',
            type:    event.data.type            || 'text',
          }
        }

      default:
        return event
    }
  }

  private async route(event: IngestionEvent): Promise<void> {
    switch (event.source) {
      case 'gmail':
        await this.emailAgent.process(event.data, event.userId)
        break

      case 'job':
        await this.jobAgent.process(event.data, event.userId)
        break

      case 'calendar':
        await this.calendarAgent.process(event.data, event.userId)
        break

      case 'github':
        await this.projectAgent.process(event.data, event.userId)
        break

      case 'manual':
        await this.factsAgent.process(event.data, event.userId)
        break

      case 'document':
        await this.documentAgent.process(event.data, event.userId)
        break

      case 'delivery':
        await this.deliveryAgent.process(event.data, event.userId)
        break

      case 'whatsapp':
        await this.whatsappAgent.process(event.data, event.userId, true)
        break

      default:
        console.error(`Unknown source: ${event.source}`)
    }
  }
}