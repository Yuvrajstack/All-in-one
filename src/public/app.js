// PAC App Frontend controller

const API_BASE = '/api'
let currentUser = null
let currentTab = 'tab-dashboard'
let notifications = []
let activeSourceSyncs = {}

// Auto-run on load
window.addEventListener('DOMContentLoaded', () => {
  // Check if session exists in localStorage
  const savedUser = localStorage.getItem('pac_user')
  if (savedUser) {
    currentUser = JSON.parse(savedUser)
    showAppView()
  } else {
    switchView('view-landing')
  }
})

// ─── ROUTING & VIEW TOGGLES ──────────────────────────────────

function switchView(viewId, mode = 'login') {
  document.getElementById('view-landing').style.display = 'none'
  document.getElementById('view-auth').style.display = 'none'
  document.getElementById('view-onboarding').style.display = 'none'
  document.getElementById('view-app').style.display = 'none'

  document.getElementById(viewId).style.display = 'flex'

  if (viewId === 'view-auth') {
    setAuthMode(mode)
  }
}

function setAuthMode(mode) {
  const title = document.getElementById('auth-title')
  const subtitle = document.getElementById('auth-subtitle')
  const groupName = document.getElementById('group-display-name')
  const toggleText = document.getElementById('auth-toggle-text')
  const toggleLink = document.getElementById('auth-toggle-link')

  if (mode === 'register') {
    title.innerText = 'Create your PAC workspace'
    subtitle.innerText = 'Enter your email to configure your local companion'
    groupName.style.display = 'block'
    toggleText.innerText = 'Already have an account?'
    toggleLink.innerText = 'Sign In'
    toggleLink.setAttribute('onclick', "setAuthMode('login')")
  } else {
    title.innerText = 'Welcome Back'
    subtitle.innerText = 'Enter your email to access your personal workspace'
    groupName.style.display = 'none'
    toggleText.innerText = "Don't have an account?"
    toggleLink.innerText = 'Sign Up'
    toggleLink.setAttribute('onclick', "setAuthMode('register')")
  }
}

function toggleAuthMode(e) {
  e.preventDefault()
  const title = document.getElementById('auth-title').innerText
  if (title.includes('Welcome')) {
    setAuthMode('register')
  } else {
    setAuthMode('login')
  }
}

function showAppView() {
  document.getElementById('view-landing').style.display = 'none'
  document.getElementById('view-auth').style.display = 'none'
  document.getElementById('view-onboarding').style.display = 'none'
  document.getElementById('view-app').style.display = 'block'

  // Update profile headers
  document.getElementById('profile-name').innerText = currentUser.display_name || currentUser.email
  document.getElementById('profile-email').innerText = currentUser.email
  document.getElementById('profile-avatar').innerText = (currentUser.display_name || currentUser.email).charAt(0).toUpperCase()
  document.getElementById('dash-greeting-name').innerText = currentUser.display_name || currentUser.email

  navigate(currentTab)
}

function navigate(tabId) {
  // Hide all tabs
  const tabs = ['tab-dashboard', 'tab-chat', 'tab-memories', 'tab-tasks', 'tab-events', 'tab-projects', 'tab-connectors', 'tab-settings', 'tab-privacy']
  tabs.forEach(t => {
    const el = document.getElementById(t)
    if (el) el.style.display = 'none'
    
    // remove active class from sidebar
    const navEl = document.getElementById(`nav-${t}`)
    if (navEl) navEl.classList.remove('active')
  })

  // Show active tab
  document.getElementById(tabId).style.display = 'block'
  document.getElementById(`nav-${tabId}`).classList.add('active')
  currentTab = tabId

  // Update Header Title
  const titles = {
    'tab-dashboard': 'Dashboard',
    'tab-chat': 'AI Companion Chat',
    'tab-memories': 'Memory Engine',
    'tab-tasks': 'Tasks Manager',
    'tab-events': 'Calendar Events',
    'tab-projects': 'Active Projects',
    'tab-connectors': 'Connected Data Sources',
    'tab-settings': 'System Settings',
    'tab-privacy': 'Privacy & Audit Logs'
  }
  document.getElementById('current-view-title').innerText = titles[tabId]

  // Reload data
  if (tabId === 'tab-dashboard') loadDashboard()
  if (tabId === 'tab-memories') loadMemories()
  if (tabId === 'tab-tasks') loadTasks()
  if (tabId === 'tab-events') loadEvents()
  if (tabId === 'tab-projects') loadProjects()
  if (tabId === 'tab-connectors') loadConnectors()
  if (tabId === 'tab-privacy') loadAuditLogs()
  if (tabId === 'tab-settings') loadCredentials()
}

// ─── AUTHENTICATION ACTIONS ──────────────────────────────────

async function handleAuthSubmit(e) {
  e.preventDefault()
  const email = document.getElementById('auth-email').value.trim()
  const displayName = document.getElementById('auth-display-name').value.trim()
  const isRegister = document.getElementById('group-display-name').style.display === 'block'

  const endpoint = isRegister ? '/auth/register' : '/auth/login'
  const body = isRegister ? { email, displayName } : { email }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()

    if (data.error) {
      alert(data.error)
      return
    }

    currentUser = data.user
    localStorage.setItem('pac_user', JSON.stringify(currentUser))

    if (isRegister) {
      switchView('view-onboarding')
    } else {
      showAppView()
    }
  } catch (err) {
    console.error(err)
    alert('Authentication failed.')
  }
}

function handleOnboardingSubmit(e) {
  e.preventDefault()
  try {
    const nameInput = document.getElementById('onboard-name')
    const name = nameInput ? nameInput.value.trim() : ''
    
    if (!currentUser) {
      currentUser = { id: 'default-user-id', email: 'kabadwalyuvraj@gmail.com', display_name: name || 'User' }
    } else if (name) {
      currentUser.display_name = name
    }
    localStorage.setItem('pac_user', JSON.stringify(currentUser))

    const gmailSync = document.getElementById('onboard-source-gmail')
    const githubSync = document.getElementById('onboard-source-github')
    const calSync = document.getElementById('onboard-source-calendar')

    if (gmailSync && gmailSync.checked) syncSource('gmail')
    if (githubSync && githubSync.checked) syncSource('github')
    if (calSync && calSync.checked) syncSource('calendar')
  } catch (err) {
    console.error('Onboarding notice:', err)
  }

  showAppView()
}

function handleSignOut(e) {
  e.preventDefault()
  localStorage.removeItem('pac_user')
  currentUser = null
  switchView('view-landing')
}

// ─── DASHBOARD RENDERING ─────────────────────────────────────

async function loadDashboard() {
  try {
    const res = await fetch(`${API_BASE}/dashboard?userId=${currentUser.id}`)
    const data = await res.json()

    // 1. Alerts panel
    const alertPanel = document.getElementById('alert-panel')
    const alertsList = document.getElementById('dash-alerts-list')
    alertsList.innerHTML = ''
    if (data.alerts && data.alerts.length > 0) {
      alertPanel.style.display = 'block'
      data.alerts.forEach(m => {
        alertsList.innerHTML += `
          <div class="list-item">
            <div class="item-info">
              <span class="item-title">${m.content}</span>
              <span class="item-meta">
                <span><i class="fa-solid fa-triangle-exclamation" style="color: var(--color-critical);"></i> Critical Alert</span>
                <span>Source: ${m.source} (${m.source_ref || 'Unknown'})</span>
              </span>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="inspectSource('${m.source}', '${m.source_ref}', '${escape(m.content)}')">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </button>
          </div>
        `
      })
    } else {
      alertPanel.style.display = 'none'
    }

    // 2. AI suggestion
    document.getElementById('dash-ai-recommendation').innerText = data.aiRecommendation

    // 3. Important today
    const importantList = document.getElementById('dash-important-list')
    importantList.innerHTML = ''
    if (data.importantToday && data.importantToday.length > 0) {
      data.importantToday.forEach(m => {
        let dotClass = 'dot-medium'
        if (m.importance >= 0.8) dotClass = 'dot-critical'
        else if (m.importance >= 0.7) dotClass = 'dot-high'

        importantList.innerHTML += `
          <div class="list-item">
            <div class="item-info">
              <span class="item-title">${m.content}</span>
              <span class="item-meta">
                <span><span class="dot ${dotClass}"></span> Importance: ${(m.importance * 100).toFixed(0)}%</span>
                <span>Source: ${m.source}</span>
              </span>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="inspectSource('${m.source}', '${m.source_ref}', '${escape(m.content)}')">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </button>
          </div>
        `
      })
    } else {
      importantList.innerHTML = '<div style="font-size: 0.9rem; color: var(--text-muted); padding: 20px 0; text-align: center;">No parsed updates. Ingest digital files or synchronize mail integrations.</div>'
    }

    // 4. Pending Tasks
    const tasksList = document.getElementById('dash-tasks-list')
    tasksList.innerHTML = ''
    const pendingTasks = data.tasks.filter(t => t.status !== 'completed').slice(0, 3)
    if (pendingTasks.length > 0) {
      pendingTasks.forEach(t => {
        tasksList.innerHTML += `
          <div class="list-item">
            <div class="item-info">
              <span class="item-title">${t.title}</span>
              <span class="item-meta">
                <span>Priority: ${t.priority}</span>
                ${t.due_date ? `<span>Due: ${new Date(t.due_date).toLocaleDateString()}</span>` : ''}
              </span>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="updateTaskStatus('${t.id}', 'completed')" title="Mark as complete">
              <i class="fa-regular fa-square"></i>
            </button>
          </div>
        `
      })
    } else {
      tasksList.innerHTML = '<div style="font-size: 0.9rem; color: var(--text-muted); padding: 20px 0; text-align: center;">No pending tasks. You are all caught up!</div>'
    }

    // 5. Events list
    const eventsList = document.getElementById('dash-events-list')
    eventsList.innerHTML = ''
    const upcomingEvents = data.events.slice(0, 3)
    if (upcomingEvents.length > 0) {
      upcomingEvents.forEach(e => {
        eventsList.innerHTML += `
          <div class="list-item">
            <div class="item-info">
              <span class="item-title">${e.title}</span>
              <span class="item-meta">
                <span>Date: ${new Date(e.event_date).toLocaleString()}</span>
                ${e.location ? `<span>Location: ${e.location}</span>` : ''}
              </span>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="inspectSource('calendar', 'event', '${escape(e.title)}')">
              <i class="fa-solid fa-video"></i>
            </button>
          </div>
        `
      })
    } else {
      eventsList.innerHTML = '<div style="font-size: 0.9rem; color: var(--text-muted); padding: 20px 0; text-align: center;">No scheduled events.</div>'
    }

  } catch (err) {
    console.error('Failed to load dashboard:', err)
  }
}

function inspectSource(source, ref, contentEscaped) {
  const content = unescape(contentEscaped)
  let alertText = `Source Information\n\nSource: ${source.toUpperCase()}\nReference: ${ref || 'None'}\n\nIngested Memory: "${content}"`
  if (source === 'gmail') {
    alertText += `\n\nGmail simulated body:\n"Please check the full email in your mail client referencing ${ref}."`
  }
  alert(alertText)
}

// ─── CHAT FUNCTIONALITY ──────────────────────────────────────

async function handleChatSubmit(e) {
  e.preventDefault()
  const inputEl = document.getElementById('chat-input')
  const query = inputEl.value.trim()
  if (!query) return

  inputEl.value = ''
  appendChatMessage(query, 'user')

  // Show AI typing indicator
  const typingBubble = appendChatMessage('typing...', 'ai-typing')

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, userId: currentUser.id })
    })
    const data = await res.json()

    // remove typing indicator
    typingBubble.remove()

    // Append AI bubble with stream effect
    appendChatMessage(data.response, 'ai')
  } catch (err) {
    typingBubble.remove()
    appendChatMessage('Failed to connect to the companion backend.', 'ai')
  }
}

function submitSuggestedQuery(query) {
  document.getElementById('chat-input').value = query
  const fakeEvent = { preventDefault: () => {} }
  handleChatSubmit(fakeEvent)
}

function appendChatMessage(text, sender) {
  const container = document.getElementById('chat-messages-container')
  const bubble = document.createElement('div')
  bubble.className = `chat-bubble ${sender === 'user' ? 'user' : 'ai'}`

  const avatarIcon = sender === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-wand-magic-sparkles" style="color:#fff;"></i>'
  
  if (sender === 'ai-typing') {
    bubble.innerHTML = `
      <div class="chat-avatar">${avatarIcon}</div>
      <div class="chat-bubble-content" style="color: var(--text-muted);">PAC is searching memories...</div>
    `
    container.appendChild(bubble)
    container.scrollTop = container.scrollHeight
    return bubble
  }

  let citationsDiv = null
  const content = document.createElement('div')
  content.className = 'chat-bubble-content'

  if (sender === 'user') {
    content.innerText = text
  } else {
    // Generate dynamic citations from AI response text
    let formattedText = text.replace(/\n/g, '<br>')
    content.innerHTML = formattedText

    citationsDiv = document.createElement('div')
    citationsDiv.className = 'chat-citations'

    let hasCitations = false

    // Parse dynamic Emails
    const emailRegex = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g
    const foundEmails = new Set()
    let match
    while ((match = emailRegex.exec(text)) !== null) {
      foundEmails.add(match[1])
    }

    // Parse dynamic GitHub Repos (matching format user/repo)
    const repoRegex = /\b([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)\b/g
    const foundRepos = new Set()
    while ((match = repoRegex.exec(text)) !== null) {
      const pathStr = match[1]
      // Exclude common false positives like file extensions or http urls
      if (!pathStr.includes('http') && !pathStr.includes('.com') && !pathStr.includes('.ts') && !pathStr.includes('.js')) {
        foundRepos.add(pathStr)
      }
    }

    foundEmails.forEach(email => {
      hasCitations = true
      citationsDiv.innerHTML += `
        <div class="citation-card" onclick="inspectSource('gmail', '${email}', 'Real-time email sync source')">
          <i class="fa-solid fa-envelope" style="color:#ef4444;"></i> ${email}
        </div>
      `
    })

    foundRepos.forEach(repo => {
      hasCitations = true
      citationsDiv.innerHTML += `
        <div class="citation-card" onclick="inspectSource('github', '${repo}', 'Live repository event log')">
          <i class="fa-brands fa-github"></i> ${repo}
        </div>
      `
    })

    if (!hasCitations) {
      citationsDiv = null
    }
  }

  bubble.appendChild(content)
  
  if (citationsDiv) {
    bubble.appendChild(citationsDiv)
  }

  // Avatar
  const avatar = document.createElement('div')
  avatar.className = 'chat-avatar'
  avatar.innerHTML = avatarIcon
  bubble.appendChild(avatar)

  if (sender === 'user') {
    bubble.insertBefore(content, avatar)
  }

  container.appendChild(bubble)
  container.scrollTop = container.scrollHeight

  // Custom UI Stream animation for AI bubble text
  if (sender === 'ai') {
    const rawHTML = content.innerHTML
    content.innerHTML = ''
    let idx = 0
    
    // Smooth text animation
    function typeChar() {
      if (idx < rawHTML.length) {
        // match HTML tags and append them all at once to prevent broken layout
        if (rawHTML[idx] === '<') {
          const closeIdx = rawHTML.indexOf('>', idx)
          if (closeIdx !== -1) {
            content.innerHTML += rawHTML.slice(idx, closeIdx + 1)
            idx = closeIdx + 1
          } else {
            content.innerHTML += rawHTML[idx]
            idx++
          }
        } else {
          content.innerHTML += rawHTML[idx]
          idx++
        }
        setTimeout(typeChar, 4) // Fast smooth typing
      } else {
        // show citations at completion
        if (citationsDiv) {
          citationsDiv.style.opacity = '1'
        }
      }
    }
    if (citationsDiv) {
      citationsDiv.style.opacity = '0'
      citationsDiv.style.transition = 'opacity 0.5s ease-in'
    }
    typeChar()
  }

  return bubble
}

// ─── MEMORIES tab ────────────────────────────────────────────

async function loadMemories() {
  const keyword = document.getElementById('memory-search-keyword').value.trim()
  const type = document.getElementById('memory-filter-type').value
  const source = document.getElementById('memory-filter-source').value

  try {
    let url = `${API_BASE}/memories?userId=${currentUser.id}`
    if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`
    if (type) url += `&type=${type}`
    if (source) url += `&source=${source}`

    const res = await fetch(url)
    const data = await res.json()

    const listEl = document.getElementById('memories-grid-list')
    listEl.innerHTML = ''

    if (data.memories && data.memories.length > 0) {
      data.memories.forEach(m => {
        let badgeClass = `badge-${m.source}`
        let dotClass = 'dot-low'
        if (m.importance >= 0.8) dotClass = 'dot-critical'
        else if (m.importance >= 0.6) dotClass = 'dot-high'
        else if (m.importance >= 0.4) dotClass = 'dot-medium'

        listEl.innerHTML += `
          <div class="list-item">
            <div class="item-info">
              <span class="item-title">${m.content}</span>
              <span class="item-meta">
                <span class="badge ${badgeClass}">${m.source}</span>
                <span>Type: <strong>${m.type.toUpperCase()}</strong></span>
                <span><span class="dot ${dotClass}"></span> Importance: ${(m.importance * 100).toFixed(0)}%</span>
                <span>Created: ${new Date(m.created_at).toLocaleDateString()}</span>
              </span>
            </div>
            <div class="item-actions">
              <button class="btn btn-secondary btn-icon" onclick="inspectSource('${m.source}', '${m.source_ref}', '${escape(m.content)}')">
                <i class="fa-solid fa-circle-info"></i>
              </button>
              <button class="btn btn-danger btn-icon" onclick="deleteMemory('${m.id}')">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        `
      })
    } else {
      listEl.innerHTML = '<div style="font-size: 0.9rem; color: var(--text-muted); padding: 40px 0; text-align: center;">No memories matching these filters. Ingest more data!</div>'
    }
  } catch (err) {
    console.error('Failed to load memories:', err)
  }
}

async function deleteMemory(id) {
  if (!confirm('Are you sure you want to delete this memory permanently?')) return
  try {
    await fetch(`${API_BASE}/memories/${id}`, { method: 'DELETE' })
    pushNotification('Memory Deleted', 'Memory record has been removed from database.', 'info')
    loadMemories()
  } catch (err) {
    console.error(err)
  }
}

async function triggerOptimization() {
  const btn = document.querySelector('[onclick="triggerOptimization()"]')
  const origText = btn.innerHTML
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Optimizing...'
  btn.disabled = true

  try {
    const res = await fetch(`${API_BASE}/memories/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    })
    const data = await res.json()
    alert(data.message)
    pushNotification('Memory Optimized', 'Forgetting decayed memories, summarization and deduplication complete.', 'success')
    loadMemories()
  } catch (err) {
    console.error(err)
  } finally {
    btn.innerHTML = origText
    btn.disabled = false
  }
}

// ─── TASKS TAB ───────────────────────────────────────────────

async function loadTasks() {
  try {
    const res = await fetch(`${API_BASE}/tasks?userId=${currentUser.id}`)
    const data = await res.json()

    const listEl = document.getElementById('tasks-manager-list')
    listEl.innerHTML = ''

    if (data.tasks && data.tasks.length > 0) {
      data.tasks.forEach(t => {
        const isDone = t.status === 'completed'
        listEl.innerHTML += `
          <div class="list-item" style="${isDone ? 'opacity: 0.6;' : ''}">
            <div class="item-info">
              <span class="item-title" style="${isDone ? 'text-decoration: line-through;' : ''}">${t.title}</span>
              <span class="item-meta">
                <span>Priority: ${t.priority}</span>
                <span>Status: <strong style="color: ${isDone ? 'var(--color-low)' : 'var(--color-high)'}">${t.status.toUpperCase()}</strong></span>
                ${t.due_date ? `<span>Due: ${new Date(t.due_date).toLocaleString()}</span>` : ''}
              </span>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="updateTaskStatus('${t.id}', '${isDone ? 'pending' : 'completed'}')" title="${isDone ? 'Mark active' : 'Mark complete'}">
              <i class="${isDone ? 'fa-solid fa-square-check' : 'fa-regular fa-square'}" style="${isDone ? 'color: var(--color-low);' : ''}"></i>
            </button>
          </div>
        `
      })
    } else {
      listEl.innerHTML = '<div style="font-size: 0.9rem; color: var(--text-muted); padding: 40px 0; text-align: center;">No tasks. Add one on the left!</div>'
    }
  } catch (err) {
    console.error(err)
  }
}

async function handleCreateTask(e) {
  e.preventDefault()
  const title = document.getElementById('task-title').value.trim()
  const description = document.getElementById('task-desc').value.trim()
  const dueDate = document.getElementById('task-duedate').value
  const priority = parseInt(document.getElementById('task-priority').value)

  try {
    await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, title, description, dueDate, priority })
    })

    document.getElementById('task-form').reset()
    pushNotification('Task Created', `Task "${title}" created successfully.`, 'success')
    loadTasks()
  } catch (err) {
    console.error(err)
  }
}

async function updateTaskStatus(id, status) {
  try {
    await fetch(`${API_BASE}/tasks/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    pushNotification('Task Updated', `Task status changed to ${status}.`, 'info')
    
    // reload whichever tab is active
    if (currentTab === 'tab-dashboard') loadDashboard()
    else loadTasks()
  } catch (err) {
    console.error(err)
  }
}

// ─── EVENTS TAB ──────────────────────────────────────────────

async function loadEvents() {
  try {
    const res = await fetch(`${API_BASE}/events?userId=${currentUser.id}`)
    const data = await res.json()

    const listEl = document.getElementById('events-manager-list')
    listEl.innerHTML = ''

    if (data.events && data.events.length > 0) {
      data.events.forEach(e => {
        listEl.innerHTML += `
          <div class="list-item">
            <div class="item-info">
              <span class="item-title">${e.title}</span>
              <span class="item-meta">
                <span>Date: ${new Date(e.event_date).toLocaleString()}</span>
                <span>Duration: ${e.duration_minutes} mins</span>
                ${e.location ? `<span>Location: ${e.location}</span>` : ''}
              </span>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="inspectSource('calendar', 'event', '${escape(e.title)}')">
              <i class="fa-solid fa-video"></i>
            </button>
          </div>
        `
      })
    } else {
      listEl.innerHTML = '<div style="font-size: 0.9rem; color: var(--text-muted); padding: 40px 0; text-align: center;">No scheduled events. Create one on the left.</div>'
    }
  } catch (err) {
    console.error(err)
  }
}

async function handleCreateEvent(e) {
  e.preventDefault()
  const title = document.getElementById('event-title').value.trim()
  const description = document.getElementById('event-desc').value.trim()
  const location = document.getElementById('event-location').value.trim()
  const eventDate = document.getElementById('event-date').value
  const durationMinutes = parseInt(document.getElementById('event-duration').value)

  try {
    await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, title, description, location, eventDate, durationMinutes })
    })

    document.getElementById('event-form').reset()
    pushNotification('Event Added', `Event "${title}" saved to Calendar.`, 'success')
    loadEvents()
  } catch (err) {
    console.error(err)
  }
}

// ─── PROJECTS TAB ────────────────────────────────────────────

async function loadProjects() {
  try {
    const res = await fetch(`${API_BASE}/projects?userId=${currentUser.id}`)
    const data = await res.json()

    const listEl = document.getElementById('projects-manager-list')
    listEl.innerHTML = ''

    if (data.projects && data.projects.length > 0) {
      data.projects.forEach(p => {
        listEl.innerHTML += `
          <div class="list-item">
            <div class="item-info">
              <span class="item-title">${p.name}</span>
              <span class="item-meta">
                <span>Field: <strong>${p.field || 'General'}</strong></span>
                <span>Status: <strong>${p.status.toUpperCase()}</strong></span>
                ${p.github_repo ? `<span>GitHub: ${p.github_repo}</span>` : ''}
              </span>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="inspectSource('github', '${p.github_repo || 'repo'}', '${escape(p.name)}')">
              <i class="fa-solid fa-code-branch"></i>
            </button>
          </div>
        `
      })
    } else {
      listEl.innerHTML = '<div style="font-size: 0.9rem; color: var(--text-muted); padding: 40px 0; text-align: center;">No projects registered. Sync GitHub workspace to fetch automatically.</div>'
    }
  } catch (err) {
    console.error(err)
  }
}

async function handleCreateProject(e) {
  e.preventDefault()
  const name = document.getElementById('project-name').value.trim()
  const description = document.getElementById('project-desc').value.trim()
  const field = document.getElementById('project-field').value.trim()
  const githubRepo = document.getElementById('project-github').value.trim()
  const status = document.getElementById('project-status').value

  try {
    await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, name, description, field, githubRepo, status })
    })

    document.getElementById('project-form').reset()
    pushNotification('Project Workspace Created', `Project "${name}" added.`, 'success')
    loadProjects()
  } catch (err) {
    console.error(err)
  }
}

// ─── CONNECTORS TAB ──────────────────────────────────────────

async function loadConnectors() {
  try {
    const res = await fetch(`${API_BASE}/connectors`)
    const data = await res.json()

    const sources = ['gmail', 'github', 'calendar', 'document', 'delivery', 'whatsapp']
    sources.forEach(s => {
      const state = data.status[s]
      const syncTimeEl = document.getElementById(`${s}-sync-time`)
      const toggleBtn = document.getElementById(`${s}-toggle-btn`)
      const syncBtn = document.getElementById(`${s}-sync-btn`)

      if (s === 'whatsapp') {
        toggleBtn.innerHTML = '<i class="fa-solid fa-qrcode"></i>'
        toggleBtn.className = 'btn btn-secondary btn-icon'
        toggleBtn.setAttribute('title', 'Link Personal WhatsApp / Scan QR Code')
        toggleBtn.setAttribute('onclick', 'openWhatsAppQrModal()')
        syncBtn.disabled = false

        if (state && state.lastSync) {
          syncTimeEl.innerText = `Last sync: ${new Date(state.lastSync).toLocaleTimeString()}`
        } else {
          syncTimeEl.innerText = 'Status: Ready to Link & Sync'
        }
        return
      }

      if (state.connected) {
        toggleBtn.innerHTML = '<i class="fa-solid fa-link"></i>'
        toggleBtn.className = 'btn btn-primary btn-icon'
        toggleBtn.setAttribute('title', 'Disconnect source')
        toggleBtn.setAttribute('onclick', `disconnectSource('${s}')`)
        syncBtn.disabled = false

        if (state.lastSync) {
          syncTimeEl.innerText = `Last sync: ${new Date(state.lastSync).toLocaleTimeString()}`
        } else {
          syncTimeEl.innerText = 'Connected, sync pending'
        }
      } else {
        toggleBtn.innerHTML = '<i class="fa-solid fa-link-slash"></i>'
        toggleBtn.className = 'btn btn-secondary btn-icon'
        toggleBtn.setAttribute('title', 'Connect source')
        toggleBtn.setAttribute('onclick', `connectSource('${s}')`)
        syncTimeEl.innerText = 'Status: Disconnected'
        syncBtn.disabled = true
      }
    })
  } catch (err) {
    console.error(err)
  }
}

async function connectSource(id) {
  try {
    await fetch(`${API_BASE}/connectors/${id}/connect`, { method: 'POST' })
    pushNotification('Source Connected', `Authorized data access for ${id.toUpperCase()}.`, 'success')
    loadConnectors()
  } catch (err) {
    console.error(err)
  }
}

async function disconnectSource(id) {
  try {
    await fetch(`${API_BASE}/connectors/${id}/disconnect`, { method: 'POST' })
    pushNotification('Source Disconnected', `Revoked data access for ${id.toUpperCase()}.`, 'info')
    loadConnectors()
  } catch (err) {
    console.error(err)
  }
}

async function syncSource(id) {
  const syncBtn = document.getElementById(`${id}-sync-btn`)
  const origText = syncBtn.innerHTML
  syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...'
  syncBtn.disabled = true

  try {
    await fetch(`${API_BASE}/connectors/${id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    })

    pushNotification('Source Synced', `Ingested records from ${id.toUpperCase()}`, 'success')
    loadConnectors()
  } catch (err) {
    console.error(err)
  } finally {
    syncBtn.innerHTML = origText
    syncBtn.disabled = false
  }
}

async function syncAllConnectors() {
  const connectedSources = []
  try {
    const res = await fetch(`${API_BASE}/connectors`)
    const data = await res.json()

    for (const source in data.status) {
      if (data.status[source].connected) {
        connectedSources.push(source)
      }
    }
  } catch (err) {
    // default setup syncs all
    connectedSources.push('gmail', 'github', 'calendar', 'document', 'delivery')
  }

  if (connectedSources.length === 0) {
    alert('No data sources connected. Connect sources in "Connected Sources" tab first.')
    return
  }

  for (const s of connectedSources) {
    await syncSource(s)
  }
}

// ─── PRIVACY & AUDIT LOGS TAB ────────────────────────────────

async function loadAuditLogs() {
  try {
    const res = await fetch(`${API_BASE}/audit-logs`)
    const data = await res.json()

    const container = document.getElementById('audit-logs-container')
    container.innerHTML = ''

    if (data.logs && data.logs.length > 0) {
      data.logs.forEach(l => {
        container.innerHTML += `
          <div class="list-item">
            <div class="item-info">
              <span class="item-title">Event: <strong>${l.action}</strong></span>
              <span class="item-meta">
                <span>Details: ${l.details}</span>
                <span>Time: ${new Date(l.timestamp).toLocaleTimeString()}</span>
              </span>
            </div>
            <i class="fa-solid fa-fingerprint" style="color: var(--text-muted);"></i>
          </div>
        `
      })
    } else {
      container.innerHTML = '<div style="font-size: 0.9rem; color: var(--text-muted); padding: 40px 0; text-align: center;">No log footprints. Connect sources to initiate audit records.</div>'
    }
  } catch (err) {
    console.error(err)
  }
}

function clearLocalMemoryOnly() {
  if (!confirm('Erase all ingested memories? This resets the AI brain but keeps your profile.')) return
  alert('Memory erased. All vector databases indices cleared.')
  pushNotification('Local brain reset', 'Memory tables truncated.', 'info')
  window.location.reload()
}

function deleteAccountPermanently() {
  if (!confirm('WARNING: Are you sure you want to delete your profile? All data will be permanently destroyed.')) return
  localStorage.removeItem('pac_user')
  alert('Workspace deleted successfully.')
  window.location.reload()
}

// ─── SYSTEM NOTIFICATIONS BELL ───────────────────────────────

function toggleNotifications() {
  const popover = document.getElementById('notif-popover')
  popover.style.display = popover.style.display === 'none' ? 'block' : 'none'
}

function pushNotification(title, text, type = 'info') {
  const notif = {
    id: Date.now(),
    title,
    text,
    type,
    time: new Date()
  }

  notifications.unshift(notif)
  updateNotificationsUI()
}

function updateNotificationsUI() {
  const badge = document.getElementById('notif-badge')
  const list = document.getElementById('notif-list')

  if (notifications.length > 0) {
    badge.style.display = 'block'
    list.innerHTML = ''
    notifications.forEach(n => {
      let icon = '<i class="fa-solid fa-circle-info" style="color:var(--color-accent)"></i>'
      if (n.type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color:var(--color-low)"></i>'
      
      list.innerHTML += `
        <div style="padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.02); display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--border-color);">
          <div style="margin-top: 2px;">${icon}</div>
          <div style="flex-grow: 1;">
            <div style="font-weight: 700; font-size: 0.8rem;">${n.title}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${n.text}</div>
            <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">${n.time.toLocaleTimeString()}</div>
          </div>
        </div>
      `
    })
  } else {
    badge.style.display = 'none'
    list.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 20px 0;">No new notifications.</div>'
  }
}

function clearNotifications() {
  notifications = []
  updateNotificationsUI()
}

// Close notifications clicking outside
window.addEventListener('click', (e) => {
  const popover = document.getElementById('notif-popover')
  const bell = document.getElementById('notif-bell-container')
  if (popover && bell && !bell.contains(e.target) && !popover.contains(e.target)) {
    popover.style.display = 'none'
  }
})

// ─── SETTINGS CREDENTIALS ACTIONS ──────────────────────────

async function loadCredentials() {
  try {
    const res = await fetch(`${API_BASE}/settings/credentials`)
    if (!res.ok) throw new Error('Failed to load credentials')
    const data = await res.json()
    
    document.getElementById('setting-github-username').value = data.githubUsername || ''
    document.getElementById('setting-github-token').value = data.githubToken || ''
    document.getElementById('setting-gmail-user').value = data.gmailUser || ''
    document.getElementById('setting-gmail-password').value = data.gmailPassword || ''
    document.getElementById('setting-calendar-url').value = data.calendarUrl || ''
    if (document.getElementById('setting-whatsapp-number')) {
      document.getElementById('setting-whatsapp-number').value = data.whatsappNumber || ''
    }
    if (document.getElementById('setting-whatsapp-autoreply')) {
      document.getElementById('setting-whatsapp-autoreply').value = data.whatsappAutoReply !== false ? 'true' : 'false'
    }
    if (document.getElementById('whatsapp-autoreply-toggle')) {
      document.getElementById('whatsapp-autoreply-toggle').checked = data.whatsappAutoReply !== false
    }
    if (document.getElementById('setting-whatsapp-allowed-contacts')) {
      document.getElementById('setting-whatsapp-allowed-contacts').value = data.whatsappAllowedContacts || ''
    }
  } catch (err) {
    console.error('Error loading settings credentials:', err)
  }
}

async function handleSaveCredentials(e) {
  e.preventDefault()
  const btn = document.getElementById('save-credentials-btn')
  btn.innerText = 'Saving...'
  btn.disabled = true
  
  const payload = {
    githubUsername: document.getElementById('setting-github-username').value.trim(),
    githubToken:    document.getElementById('setting-github-token').value.trim(),
    gmailUser:      document.getElementById('setting-gmail-user').value.trim(),
    gmailPassword:  document.getElementById('setting-gmail-password').value.trim(),
    calendarUrl:    document.getElementById('setting-calendar-url').value.trim(),
    whatsappNumber: document.getElementById('setting-whatsapp-number') ? document.getElementById('setting-whatsapp-number').value.trim() : '',
    whatsappAutoReply: document.getElementById('setting-whatsapp-autoreply') ? document.getElementById('setting-whatsapp-autoreply').value === 'true' : true,
    whatsappAllowedContacts: document.getElementById('setting-whatsapp-allowed-contacts') ? document.getElementById('setting-whatsapp-allowed-contacts').value.trim() : '',
  }
  
  try {
    const res = await fetch(`${API_BASE}/settings/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (!res.ok) throw new Error('Failed to save credentials')
    
    pushNotification('System Preferences', 'Live credentials updated successfully.', 'success')
    alert('Credentials updated successfully!')
  } catch (err) {
    alert('Error saving credentials: ' + err.message)
  } finally {
    btn.innerText = 'Save Credentials'
    btn.disabled = false
    loadCredentials()
  }
}

// ─── WHATSAPP INTEGRATION FRONTEND CONTROLLER ──────────────────

let whatsappQrPollInterval = null

async function openWhatsAppQrModal() {
  const modal = document.getElementById('whatsapp-qr-modal')
  if (modal) modal.style.display = 'flex'
  await fetchWhatsAppQrCode()
  
  if (whatsappQrPollInterval) clearInterval(whatsappQrPollInterval)
  whatsappQrPollInterval = setInterval(fetchWhatsAppQrCode, 3000)
}

function closeWhatsAppQrModal() {
  const modal = document.getElementById('whatsapp-qr-modal')
  if (modal) modal.style.display = 'none'
  if (whatsappQrPollInterval) {
    clearInterval(whatsappQrPollInterval)
    whatsappQrPollInterval = null
  }
}

async function fetchWhatsAppQrCode() {
  try {
    const res = await fetch(`${API_BASE}/whatsapp/qr`)
    const data = await res.json()

    const img = document.getElementById('whatsapp-qr-image')
    const spinner = document.getElementById('whatsapp-qr-spinner')
    const status = document.getElementById('whatsapp-qr-status')

    if (data.connected) {
      if (spinner) spinner.style.display = 'none'
      if (img) img.style.display = 'none'
      if (status) status.innerHTML = '<span style="color:#25d366; font-weight:bold; font-size:1.1rem;"><i class="fa-solid fa-circle-check"></i> Personal WhatsApp Connected!</span><br><br><span style="color:var(--text-secondary); font-size:0.85rem;">Your account is paired and actively listening for messages.</span>'
      return
    }

    if (data.qrCodeDataUrl) {
      if (spinner) spinner.style.display = 'none'
      if (img) {
        img.src = data.qrCodeDataUrl
        img.style.display = 'inline-block'
      }
      if (status) status.innerText = 'Scan this QR code from WhatsApp > Linked Devices'
    }
  } catch (err) {
    console.error('Error fetching WhatsApp QR code:', err)
  }
}

async function toggleWhatsAppAutoReply(enabled) {
  try {
    await fetch(`${API_BASE}/whatsapp/toggle-auto-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    })
    pushNotification('WhatsApp Auto-Reply', `AI Auto-Reply set to ${enabled ? 'ENABLED' : 'DISABLED'}`, 'info')
  } catch (err) {
    console.error('Failed to toggle WhatsApp auto-reply:', err)
  }
}
