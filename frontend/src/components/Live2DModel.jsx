import { useLayoutEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

window.PIXI = PIXI

const MODEL_PATH = '/models/PinkFox/PinkFox.model3.json'

// expression_id -> param id (from .exp3.json ParamId) + Chinese name
// Verified against PinkFox/PinkFox.cdi3.json (authoritative param names)
// and PinkFox/yousuyiyi`*.exp3.json (file suffix -> param Id mapping)
const EXPRESSIONS = {
  0: { param: 'key9',  name: '猫猫眼' },
  1: { param: 'key1',  name: '发型1' },
  2: { param: 'key18', name: '发型2' },
  3: { param: 'key2',  name: '吐舌' },
  4: { param: 'key3',  name: '黑脸' },
  5: { param: 'key4',  name: '眼泪' },
  6: { param: 'key5',  name: '脸红' },
  7: { param: 'key6',  name: 'nn眼' },
  8: { param: 'key7',  name: '生气瘪嘴' },
  9: { param: 'key8',  name: '死鱼眼' },
  10: { param: 'key13', name: '总督' },
  11: { param: 'key12', name: '钱钱' },
  12: { param: 'key19', name: '兽耳消失' },
  13: { param: 'key20', name: '尾巴消失' },
  14: { param: 'key10', name: '--眼' },
  15: { param: 'key14', name: '提督' },
  16: { param: 'key15', name: '舰长' },
  17: { param: 'key17', name: '泪眼' },
  18: { param: 'key11', name: '嘟嘴' },
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
  const paramIntervalRef = useRef(null)
  const mouthValueRef = useRef(0)
  const elapsedRef = useRef(0)

  useImperativeHandle(ref, () => ({
    showExpression(expId) {
      const model = modelRef.current
      if (!model) return
      const expr = EXPRESSIONS[expId]
      if (!expr) {
        console.warn(`[Live2D] Unknown expression id: ${expId}`)
        return
      }
      console.log(`[Live2D] Setting expression: ${expId} -> ${expr.param} (${expr.name})`)
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
      console.log('[Live2D] Clearing expression')
      const prevParam = activeExprParamRef.current
      activeExprValueRef.current = 0
      clearTimeout(resetTimerRef.current)
      // Keep writing 0 for 1 second to ensure the model resets
      setTimeout(() => {
        if (activeExprValueRef.current === 0) {
          activeExprRef.current = null
          activeExprParamRef.current = null
          console.log('[Live2D] Expression refs cleared')
        }
      }, 1000)
    },

    triggerMotion(motion) {
      const model = modelRef.current
      if (!model) {
        console.error('[Live2D] triggerMotion: model is null!')
        return
      }
      const mm = model.internalModel?.motionManager
      if (!mm) return

      const sep = motion.indexOf(':')
      const group = sep >= 0 ? motion.substring(0, sep) : motion
      const index = sep >= 0 ? parseInt(motion.substring(sep + 1), 10) : undefined

      console.log(`[Live2D] triggerMotion: group="${group}" index=${index}`)
      // Call only ONCE (not both model.motion and mm.startMotion)
      // model.motion handles fade in/out properly via Cubism motionManager state
      if (index !== undefined) {
        model.motion(group, index)
      } else {
        model.motion(group)
      }
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
    console.log('[Live2D] Component mounted, setting up...')
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

        console.log('[Live2D] Model loaded successfully!')
        console.log('[Live2D] Model internalModel:', !!model.internalModel)
        console.log('[Live2D] MotionManager:', !!model.internalModel?.motionManager)
        const mm = model.internalModel.motionManager
        console.log('[Live2D] Motion definitions:', JSON.stringify(Object.keys(mm.definitions || {})))
        if (mm.definitions?.['']) {
          console.log('[Live2D] Empty group motions count:', mm.definitions[''].length)
        }
        mm.stopAllMotions()
        if (mm.state && mm.state.shouldRequestIdleMotion) {
          mm.state.shouldRequestIdleMotion = () => false
        }
        model.autoInteract = false
        model.draggable = false
        model.autoUpdate = false  // Disable PIXI ticker auto-update; we drive updates from setInterval

        // Patch _startMotion to enable crossfade between motions.
        // The default _startMotion calls stopAllMotions() which immediately kills
        // the old motion (hard cut, no fade). The lower-level queueManager.startMotion()
        // supports crossfade by calling setFadeOut() on old entries before adding the new one.
        // We also use accumulated elapsed time (seconds) instead of performance.now() (ms)
        // to match the time base used by im.update() → motionManager.update().
        mm._startMotion = function(motion, onFinish) {
          motion.setFinishedMotionHandler(onFinish)
          return mm.queueManager.startMotion(motion, false, elapsedRef.current / 1000)
        }

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
        // Use setInterval to drive both Cubism update AND PIXI render because
        // Chrome throttles requestAnimationFrame to 0fps in background tabs.
        // We do everything that app.ticker.add() would do + render.
        let debugFrameCount = 0
        let lastTime = performance.now()
        paramIntervalRef.current = setInterval(() => {
          if (!modelRef.current) return
          const now = performance.now()
          const dt = now - lastTime
          lastTime = now
          elapsedRef.current += dt

          // Drive full Cubism update pipeline (motion, physics, eyeblink, pose)
          // This handles fade in/out for motions.
          const im = modelRef.current.internalModel
          im.update(dt, elapsedRef.current)

          // Override mouth + expression params AFTER motion update
          const c = im.coreModel
          const m = mouthValueRef.current
          c.setParameterValueById('ParamMouthOpenY', m)
          c.setParameterValueById('Tonguelicking', m)
          c.setParameterValueById('MouthBig2', m * 0.6)
          const exprParam = activeExprParamRef.current
          const exprVal = activeExprValueRef.current
          if (exprParam) {
            c.setParameterValueById(exprParam, exprVal)
            if (debugFrameCount++ < 60) {
              console.log(`[Live2D] Ticker: setting ${exprParam}=${exprVal}`)
            }
          }

          // Render the stage (rAF is throttled in background tabs)
          if (appRef.current) {
            appRef.current.renderer.render(appRef.current.stage)
          }
        }, 16) // ~60fps
      } catch (err) {
        console.error('[Live2D] Failed to load model:', err)
      }
    })()

    return () => {
      destroyed = true
      clearInterval(paramIntervalRef.current)
      paramIntervalRef.current = null
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
