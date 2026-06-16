import { useRef, useEffect, useState } from 'react'
import Live2DDisplay from './components/Live2DModel'
import DialogueBox from './components/DialogueBox'
import MoodIndicator from './components/MoodIndicator'
import { createWsConnection } from './api/ws'
import './App.css'

const EXP_ID_TO_NAME = {
  0: '猫猫眼', 1: '发型1', 2: '发型2', 3: '吐舌', 4: '黑脸',
  5: '眼泪', 6: '脸红', 7: 'nn眼', 8: '生气瘪嘴', 9: '死鱼眼',
  10: '总督', 11: '钱钱眼', 12: '兽耳消失', 13: '尾巴消失',
  14: '咪咪眼', 15: '提督', 16: '舰长', 17: '泪眼', 18: '嘟嘴', 19: '爱心',
}

function App() {
  const live2dRef = useRef(null)
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [debugLogs, setDebugLogs] = useState([])
  const [currentExpression, setCurrentExpression] = useState(null)
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
  }

  return (
    <div className="app">
      <div className={`ws-status ${connected ? 'on' : 'off'}`} />
      <MoodIndicator expression={currentExpression} />
      <div className="live2d-main">
        <Live2DDisplay ref={live2dRef} onTouch={handleTouch} />
      </div>
      <DialogueBox />
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
