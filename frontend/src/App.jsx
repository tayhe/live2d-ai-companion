import { useRef, useEffect, useState, useCallback } from 'react'
import Live2DDisplay from './components/Live2DModel'
import DialogueBox from './components/DialogueBox'
import MoodIndicator from './components/MoodIndicator'
import MoodOverlay from './components/MoodOverlay'
import TouchRipple from './components/TouchRipple'
import QuickReplies from './components/QuickReplies'
import DialogueHistory from './components/DialogueHistory'
import Particles from './components/Particles'
import Background from './components/Background'
import { getTimeOfDay } from './utils/timeOfDay'
import { createWsConnection } from './api/ws'
import './App.css'

const EXP_ID_TO_NAME = {
  0: '猫猫眼', 1: '发型1', 2: '发型2', 3: '吐舌', 4: '黑脸',
  5: '眼泪', 6: '脸红', 7: 'nn眼', 8: '生气瘪嘴', 9: '死鱼眼',
  10: '总督', 11: '钱钱眼', 12: '兽耳消失', 13: '尾巴消失',
  14: '咪咪眼', 15: '提督', 16: '舰长', 17: '泪眼', 18: '嘟嘴', 19: '爱心',
}

const MOOD_TO_RIM = {
  '咪咪眼': 'rgba(255, 220, 100, 0.18)',
  '爱心': 'rgba(255, 220, 100, 0.18)',
  '吐舌': 'rgba(255, 220, 100, 0.18)',
  '脸红': 'rgba(255, 130, 180, 0.2)',
  '眼泪': 'rgba(100, 140, 220, 0.18)',
  '泪眼': 'rgba(100, 140, 220, 0.18)',
  '生气': 'rgba(220, 60, 60, 0.18)',
  '黑脸': 'rgba(220, 60, 60, 0.18)',
  '生气瘪嘴': 'rgba(220, 60, 60, 0.18)',
}

function App() {
  const live2dRef = useRef(null)
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [debugLogs, setDebugLogs] = useState([])
  const [currentExpression, setCurrentExpression] = useState(null)
  const [timeOfDay, setTimeOfDay] = useState(getTimeOfDay)
  const [ripples, setRipples] = useState([])
  const [quickReplyOptions, setQuickReplyOptions] = useState([])
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const moodTimerRef = useRef(null)

  const addHistory = useCallback((type, content) => {
    setHistory(prev => [...prev, { type, content, time: Date.now() }])
  }, [])

  useEffect(() => {
    const conn = createWsConnection({
      onConnect() { setConnected(true) },
      onDisconnect() { setConnected(false) },
      onDisplayText(text, duration) {
        window.__showDialogue?.(text, duration)
        addHistory('assistant', text)
        // Clear quick replies when new text arrives
        setQuickReplyOptions([])
      },
      onSetExpression(expId) {
        live2dRef.current?.showExpression(expId)
        const name = EXP_ID_TO_NAME[expId]
        if (name) {
          setCurrentExpression(name)
          clearTimeout(moodTimerRef.current)
          moodTimerRef.current = setTimeout(() => setCurrentExpression(null), 5000)
        }
      },
      onClearExpression() {
        live2dRef.current?.clearExpression()
        setCurrentExpression(null)
        clearTimeout(moodTimerRef.current)
      },
      onTriggerMotion(motion) {
        live2dRef.current?.triggerMotion(motion)
      },
      onSetPosition(x, y) {
        live2dRef.current?.setPosition(x, y)
      },
      onSetEffect(effectId) {
        console.log('[Effect] TODO:', effectId)
      },
      onSetMouthOpen(value) {
        live2dRef.current?.setMouthOpen(value)
      },
      onQuickReplies(options) {
        setQuickReplyOptions(options)
      },
    })
    wsRef.current = conn

    // Intercept console logs for on-screen debug display
    const origLog = console.log
    const origWarn = console.warn
    const origError = console.error
    function addLog(level, args) {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      setDebugLogs(prev => [...prev.slice(-20), `[${level}] ${msg}`])
    }
    console.log = (...args) => { origLog(...args); addLog('L', args) }
    console.warn = (...args) => { origWarn(...args); addLog('W', args) }
    console.error = (...args) => { origError(...args); addLog('E', args) }

    // Keyboard shortcuts
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'Escape' || e.key === 'h') {
        setShowHistory(prev => !prev)
      }
      if (e.key === 'd') {
        setShowDebug(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKey)

    return () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
      clearTimeout(moodTimerRef.current)
      window.removeEventListener('keydown', handleKey)
      conn.disconnect()
    }
  }, [addHistory])

  function handleTouch(area, pos) {
    wsRef.current?.send({ type: 'touch', area, x: pos.x, y: pos.y })
    // Touch ripple effect
    const id = Date.now()
    setRipples(prev => [...prev, { id, x: pos.x, y: pos.y }])
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 700)
  }

  function handleQuickReplySelect(option) {
    // Send selection back via WebSocket
    wsRef.current?.send({ type: 'quick_reply_selected', option })
    // Add to history as user message
    addHistory('user', option)
    // Hide quick replies
    setQuickReplyOptions([])
  }

  function handleSendMessage() {
    const text = chatInput.trim()
    if (!text) return
    wsRef.current?.send({ type: 'user_message', text })
    addHistory('user', text)
    setChatInput('')
    setQuickReplyOptions([])
  }

  const rimColor = MOOD_TO_RIM[currentExpression] || 'rgba(47, 164, 231, 0.15)'

  return (
    <div className="app" style={{ '--rim-color': rimColor }}>
      <Background />
      <Particles timeOfDay={timeOfDay} />
      <div className="vignette" />
      <MoodOverlay expression={currentExpression} />
      <div className={`ws-status ${connected ? 'on' : 'off'}`} />
      <MoodIndicator expression={currentExpression} />
      <div className="live2d-main">
        <Live2DDisplay ref={live2dRef} onTouch={handleTouch} />
      </div>
      <DialogueBox>
        <QuickReplies options={quickReplyOptions} onSelect={handleQuickReplySelect} visible={quickReplyOptions.length > 0} />
        <input
          className="chat-input"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="输入消息..."
        />
        <button className="chat-send-btn" onClick={handleSendMessage}>发送</button>
      </DialogueBox>
      {ripples.map(r => <TouchRipple key={r.id} x={r.x} y={r.y} />)}
      <DialogueHistory history={history} charName="薇冉" visible={showHistory} onClose={() => setShowHistory(false)} />
      {showDebug && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'rgba(0,0,0,0.8)', color: '#0f0', fontSize: 11,
          fontFamily: 'monospace', padding: 4, maxHeight: 150, overflow: 'auto',
          zIndex: 9999
        }}>
          {debugLogs.slice(-10).map((log, i) => <div key={i}>{log}</div>)}
        </div>
      )}
    </div>
  )
}

export default App
