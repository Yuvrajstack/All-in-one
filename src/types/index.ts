// ─── MEMORY TYPES ────────────────────────────────────────────

export type MemoryType = 'fact' | 'task' | 'event' | 'project'

export type MemorySource = 'gmail' | 'github' | 'calendar' | 'manual' | 'whatsapp' | 'document' | 'delivery' | 'job'

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'

export type ProjectStatus = 'planning' | 'active' | 'completed' | 'abandoned'

export type EventType = 'interview' | 'meeting' | 'deadline' | 'personal'

export type Recurrence = 'daily' | 'weekly' | 'monthly'

// ─── CORE MEMORY UNIT ────────────────────────────────────────

export interface MemoryUnit {
  id: string
  userId: string
  type: MemoryType
  content: string
  category?: string
  source: MemorySource
  sourceRef?: string        // original email ID / PR number for citations
  importance: number        // 0.0 - 1.0
  eventDate?: Date
  dueDate?: Date
  createdAt: Date
  accessedAt?: Date
  deletedAt?: Date
}

// ─── TASK ────────────────────────────────────────────────────

export interface Task {
  id: string
  memoryId: string
  userId: string
  title: string
  description?: string
  assignedBy?: string
  status: TaskStatus
  dueDate?: Date
  startedAt?: Date
  doneAt?: Date
  priority: number          // 1 (critical) → 5 (low)
  deletedAt?: Date
}

// ─── EVENT ───────────────────────────────────────────────────

export interface Event {
  id: string
  memoryId: string
  userId: string
  title: string
  description?: string
  location?: string         // physical place
  meetingLink?: string      // zoom/meet URL
  eventDate: Date
  durationMinutes: number
  isRecurring: boolean
  recurrence?: Recurrence
  recurrenceDay?: string    // "Monday", "Friday"
  attendees: string[]
  eventType: EventType
  deletedAt?: Date
}

// ─── PROJECT ─────────────────────────────────────────────────

export interface Project {
  id: string
  memoryId: string
  userId: string
  name: string
  description?: string
  field?: string            // "AI" | "Backend" | "Full Stack"
  status: ProjectStatus
  teamMembers: string[]
  owner?: string
  githubRepo?: string
  liveUrl?: string
  startDate?: Date
  deadline?: Date
  completedAt?: Date
  deletedAt?: Date
}

// ─── INPUT TYPES ─────────────────────────────────────────────

export interface CreateMemoryInput {
  userId: string
  type: MemoryType
  content: string
  category?: string
  source: MemorySource
  sourceRef?: string
  importance?: number
  eventDate?: Date
  dueDate?: Date
}

// ─── SEARCH ──────────────────────────────────────────────────

export interface SearchResult {
  memory: MemoryUnit
  score: number             // similarity score from Qdrant
}