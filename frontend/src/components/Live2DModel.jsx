import { useLayoutEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

window.PIXI = PIXI

const MODEL_PATH = '/models/PinkFox/PinkFox.model3.json'

// expression_id -> param id (from .exp3.json ParamId) + Chinese name
// Based on inspection of PinkFox/*.exp3.json files
const EXPRESSIONS = {
  0: { param: 'key9',  name: '猫猫眼' },
  1: { param: 'key1',  name: '发型1' },
  2: { param: 'key18', name: '发型2' },
  3: { param: 'key2',  name: '脸红' },
  4: { param: 'key3',  name: '黑脸' },
  5: { param: 'key4',  name: '眼泪' },
  6: { param: 'key5',  name: 'nn眼' },
  7: { param: 'key6',  name: '生气瘪嘴' },
  8: { param: 'key7',  name: '死鱼眼' },
  9: { param: 'key8',  name: '咪咪眼' },
  10: { param: 'key13', name: '总督' },
  11: { param: 'key12', name: '嘟嘴' },
  12: { param: 'key19', name: '兽耳消失' },
  13: { param: 'key20', name: '尾巴消失' },
  14: { param: 'key10', name: '嘟嘴' },
  15: { param: 'key14', name: '提督' },
  16: { param: 'key15', name: '舰长' },
  17: { param: 'key17', name: '泪眼' },
  18: { param: 'key11', name: '钱钱眼' },
  19: { param: 'key16', name: '爱心' },
}

const Live2DDisplay = forwardRef(({ onTouch }, ref) => {
  const containerRef = useRef(null)
  const appRef = useRef(null)
  const modelRef = useRef(null)
  const activeExprRef = useRef(null)
  const activeExprParamRef = useRef(null)
  const activeExprValueRef = useRef(0)
  const resetTimerRef = useRef(null)
  const mouthValueRef = useRef(0)

  useImperativeHandle(ref, () => ({
    showExpression(expId) {
      const model = modelRef.current
      if (!model) return
      const expr = EXPRESSIONS[expId]
      if (!expr) {
        console.warn(`[Live2D] Unknown expression id: ${expId}`)
        return
      }
      activeExprRef.current = expId
      activeExprParamRef.current = expr.param
      activeExprValueRef.current = 1

      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(() => {
        if (activeExprRef.current === expId) {
          activeExprValueRef.current = 0
          setTimeout(() => {
            if (activeExprRef.current === expId) {
              activeExprRef.current = null
              activeExprParamRef.current = null
            }
          }, 500)
        }
      }, 8000)
    },

    clearExpression() {
      activeExprValueRef.current = 0
      activeExprRef.current = null
      activeExprParamRef.current = null
      clearTimeout(resetTimerRef.current)
    },

    triggerMotion(group) {
      const model = modelRef.current
      if (!model) return
      model.motion(group)
    },

    setPosition(x, y) {
      const model = modelRef.current
      if (!model) return
      model.x = x
      model.y = y
    },

    setMouthOpen(value) {
      mouthValueRef.current = value
    },
  }))

  useLayoutEffect(() => {
    if (appRef.current) {
      appRef.current.destroy(true)
      appRef.current = null
    }
    if (containerRef.current) {
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild)
      }
    }
    if (!containerRef.current) return

    const app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundAlpha: 0,
      resizeTo: window,
      antialias: true,
    })
    appRef.current = app
    containerRef.current.appendChild(app.view)

    let destroyed = false
    ;(async () => {
      if (modelRef.current) return
      try {
        const model = await Live2DModel.from(MODEL_PATH)
        if (destroyed || !appRef.current) return

        modelRef.current = model
        window.__live2dModel = model

        const mm = model.internalModel.motionManager
        mm.stopAllMotions()
        model.autoInteract = false
        model.draggable = false

        const scale = Math.min(
          app.view.width / model.width,
          app.view.height / model.height
        ) * 1.4
        model.scale.set(scale)
        model.x = app.view.width / 2
        model.y = app.view.height * 0.5
        model.anchor.set(0.5, 0.35)

        app.stage.addChild(model)

        // Click/touch detection
        app.view.addEventListener('click', (e) => {
          if (!modelRef.current) return
          const model = modelRef.current
          const bounds = model.getBounds()

          const x = e.offsetX, y = e.offsetY
          if (x < bounds.x || x > bounds.x + bounds.width ||
              y < bounds.y || y > bounds.y + bounds.height) return

          const relY = (y - bounds.y) / bounds.height
          let area = 'body'
          if (relY < 0.25) area = 'head'
          else if (relY < 0.45) area = 'face'

          model.motion('')
          onTouch?.(area, { x: e.clientX, y: e.clientY })
        })

        // write mouth + expression params each frame (defeats idle motion reset)
        app.ticker.add(() => {
          if (!modelRef.current) return
          const c = modelRef.current.internalModel.coreModel
          const m = mouthValueRef.current
          c.setParameterValueById('ParamMouthOpenY', m)
          c.setParameterValueById('Tonguelicking', m)
          c.setParameterValueById('MouthBig2', m * 0.6)
          const exprParam = activeExprParamRef.current
          if (exprParam) {
            c.setParameterValueById(exprParam, activeExprValueRef.current)
          }
        })
      } catch (err) {
        console.error('[Live2D] Failed to load model:', err)
      }
    })()

    return () => {
      destroyed = true
      clearTimeout(resetTimerRef.current)
      if (modelRef.current) {
        modelRef.current.destroy()
        modelRef.current = null
      }
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
    }
  }, [])

  return <div ref={containerRef} className="live2d-container" />
})

export default Live2DDisplay
