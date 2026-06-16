import { useRef, useEffect, useState } from 'react'
import Live2DDisplay from './components/Live2DModel'
import DialogueBox from './components/DialogueBox'
import MoodIndicator from './components/MoodIndicator'
import MoodOverlay from './components/MoodOverlay'
import TouchRipple from './components/TouchRipple'
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
  const moodTimerRef = useRef(null)

  useEffect(() => {
    const conn = createWsConnection({
      onConnect() { setConnected(true) },
      onDisconnect() { setConnected(false) },
      onDisplayText(text, duration) {
        window.__showDialogue?.(text, duration)
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

    return () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
      clearTimeout(moodTimerRef.current)
      conn.disconnect()
    }
  }, [])

  function handleTouch(area, pos) {
    wsRef.current?.send({ type: 'touch', area, x: pos.x, y: pos.y })
    // Touch ripple effect
    const id = Date.now()
    setRipples(prev => [...prev, { id, x: pos.x, y: pos.y }])
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 700)
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
      <DialogueBox />
      {ripples.map(r => <TouchRipple key={r.id} x={r.x} y={r.y} />)}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.8)', color: '#0f0', fontSize: 11,
        fontFamily: 'monospace', padding: 4, maxHeight: 150, overflow: 'auto',
        zIndex: 9999
      }}>
        {debugLogs.slice(-10).map((log, i) => <div key={i}>{log}</div>)}
      </div>
    </div>
  )
}

export default App
