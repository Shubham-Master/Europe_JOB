import React, { useEffect, useMemo, useRef, useState } from 'react'
import './GuideBot.css'

const GUIDE_STATE_KEY = 'eurojobs:guide-open'

function welcomeForRoute(currentPath, hasSelectedJob) {
  if (currentPath.startsWith('/cover-letter')) {
    return hasSelectedJob
      ? 'You already have a selected role. If you want, I can help you tailor the letter or explain what to do next.'
      : 'This page works after you choose a role in Jobs. Ask me how to get there or what the full flow looks like.'
  }

  if (currentPath.startsWith('/cv')) {
    return 'This is the starting point. Upload your CV here, then I can guide you through the next steps.'
  }

  if (currentPath.startsWith('/pipeline')) {
    return 'This is where matching begins. Ask me when to run Pipeline, why jobs might still be empty, or what happens after it finishes.'
  }

  return 'Need a quick nudge? Ask me what to do next, how filters work, or why jobs are not showing yet.'
}

function promptsForRoute(currentPath, hasSelectedJob) {
  if (currentPath.startsWith('/cover-letter')) {
    return [
      'Why is this page empty?',
      'How do I tailor my CV?',
      hasSelectedJob ? 'How do I regenerate?' : 'Take me to Jobs',
    ]
  }

  if (currentPath.startsWith('/pipeline')) {
    return [
      'What does pipeline do?',
      'Why no jobs yet?',
      'What should I do after pipeline?',
    ]
  }

  if (currentPath.startsWith('/cv')) {
    return [
      'What file should I upload?',
      'How do I start?',
      'What happens after upload?',
    ]
  }

  return [
    'How do filters help?',
    'How do I start?',
    'Why no jobs yet?',
  ]
}

function localGuideReply(messageText, currentPath, hasSelectedJob, countryFilter) {
  const text = messageText.toLowerCase()

  if (text.includes('how this will help') || text.includes('how will this help') || text.includes('help me')) {
    return {
      text: 'I help you avoid guessing the flow. If you are stuck, I tell you the next action on this page, like whether you should upload your CV, run Pipeline, change filters, or go back to Jobs first.',
      action: currentPath === '/cv' ? null : { label: 'Open My CV', path: '/cv' },
    }
  }

  if (text.includes('filter')) {
    return {
      text: `Filters narrow the list by country, score, and keywords. ${countryFilter && countryFilter !== 'All' ? `Right now you are focused on ${countryFilter}, so keep that filter and increase the score gradually.` : 'A good starting point is to choose a country first, then tighten the score only after jobs appear.'}`,
      action: { label: 'Open Jobs', path: '/jobs' },
    }
  }

  if (text.includes('start')) {
    return {
      text: 'Start on My CV and upload your latest PDF. Then run Pipeline once, review the matched roles in Jobs, and generate a cover letter only after selecting a role you actually want to apply for.',
      action: { label: 'Open My CV', path: '/cv' },
    }
  }

  if (text.includes('no jobs') || text.includes('empty') || text.includes('missing')) {
    return {
      text: 'Usually this means Pipeline has not run against your latest CV yet, or your filters are too strict. Upload your CV, run Pipeline once, then come back to Jobs and keep the score low at first.',
      action: { label: 'Open Pipeline', path: '/pipeline' },
    }
  }

  if (currentPath.startsWith('/cover-letter')) {
    return hasSelectedJob
      ? {
          text: 'This page uses the role you selected in Jobs. If the content looks outdated, go back, choose the role again, and regenerate from there.',
          action: { label: 'Open Jobs', path: '/jobs' },
        }
      : {
          text: 'This page stays empty until you select a role in Jobs. Pick a job there first, then come back here to generate tailored content.',
          action: { label: 'Open Jobs', path: '/jobs' },
        }
  }

  if (currentPath.startsWith('/pipeline')) {
    return {
      text: 'Pipeline scrapes roles, compares them with your CV, and prepares ranked matches. Run it after every meaningful CV update so your results stay relevant.',
      action: { label: 'Run from Pipeline', path: '/pipeline' },
    }
  }

  if (currentPath.startsWith('/cv')) {
    return {
      text: 'Upload a clean PDF resume with readable headings and bullet points. Once parsing finishes, your profile preview and CV versions will appear here.',
      action: null,
    }
  }

  return {
    text: 'Tell me what you are trying to do and I will point you to the next useful step inside this app.',
    action: currentPath !== '/cv' ? { label: 'Open My CV', path: '/cv' } : null,
  }
}

export default function GuideBot({ currentPath, hasSelectedJob, onNavigate, countryFilter = 'All' }) {
  const prompts = useMemo(
    () => promptsForRoute(currentPath, hasSelectedJob),
    [currentPath, hasSelectedJob],
  )
  const inputRef = useRef(null)
  const messagesRef = useRef(null)
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(GUIDE_STATE_KEY) !== 'closed'
  })
  const [messages, setMessages] = useState([{ role: 'assistant', text: welcomeForRoute(currentPath, hasSelectedJob) }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setMessages([{ role: 'assistant', text: welcomeForRoute(currentPath, hasSelectedJob) }])
  }, [currentPath, hasSelectedJob])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(GUIDE_STATE_KEY, open ? 'open' : 'closed')
  }, [open])

  useEffect(() => {
    if (!messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages, loading])

  const askPrompt = (prompt) => {
    submit(prompt)
  }

  const submit = async (messageText) => {
    const nextMessage = messageText.trim()
    if (!nextMessage || loading) return

    setLoading(true)
    setInput('')
    setMessages((current) => [...current, { role: 'user', text: nextMessage }].slice(-8))
    window.setTimeout(() => {
      const fallback = localGuideReply(nextMessage, currentPath, hasSelectedJob, countryFilter)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: fallback.text,
          action: fallback.action,
        },
      ].slice(-8))
      setLoading(false)
    }, 180)
  }

  const latestAction = [...messages].reverse().find((message) => message.action)?.action
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')

  return (
    <div className={`guide-bot ${open ? 'open' : ''}`}>
      <button className="guide-launcher" onClick={() => setOpen((value) => !value)}>
        <span className="guide-launcher-icon">🧭</span>
        <span>{open ? 'Hide guide' : 'Ask guide'}</span>
      </button>

      {open && (
        <div className="guide-panel">
          <div className="guide-header">
            <div>
              <div className="guide-kicker">EuroGuide</div>
              <div className="guide-title">Ask anything about this page</div>
            </div>
            <button className="guide-close" onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="guide-messages" ref={messagesRef}>
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`guide-message ${message.role}`}>
                {message.text}
              </div>
            ))}
            {loading && (
              <div className="guide-message assistant guide-message-loading">
                Thinking...
              </div>
            )}
          </div>

          <div className="guide-prompts">
            {prompts.slice(0, 3).map((prompt) => (
              <button key={prompt} className="guide-chip" onClick={() => askPrompt(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <form
            className="guide-input-row"
            onSubmit={(event) => {
              event.preventDefault()
              submit(input)
            }}
          >
            <input
              ref={inputRef}
              className="guide-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type your question..."
            />
            <button className="guide-send" type="submit" disabled={loading || !input.trim()}>
              {loading ? '...' : 'Send'}
            </button>
          </form>

          {latestAction && (
            <button className="guide-cta" onClick={() => onNavigate(latestAction.path)}>
              {latestAction.label}
            </button>
          )}

          {lastAssistant && (
            <div className="guide-footnote">
              Context-aware for this page only.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function labelForRoute(route) {
  if (route === '/cv') return 'My CV'
  if (route === '/pipeline') return 'Pipeline'
  if (route === '/cover-letter') return 'Cover Letter'
  return 'Jobs'
}
