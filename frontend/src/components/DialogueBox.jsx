import { useState, useEffect, useRef } from 'react'

export default function DialogueBox() {
  const [text, setText] = useState('')
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    window.__showDialogue = (newText, duration = 3000) => {
      setText(newText)
      setVisible(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), duration)
    }
    return () => {
      delete window.__showDialogue
      clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className={`dialogue-box ${visible ? 'visible' : 'hidden'}`}>
      <div className="dialogue-text">{text}</div>
    </div>
  )
}
