import type { App } from '../dist/index.js'

interface ControlsDeps {
  containerWidth: { value: number }
  itemCount: { value: number }
  app: App
  appEl: HTMLElement
}

export function initControls(deps: ControlsDeps) {
  const { containerWidth, itemCount, app, appEl } = deps

  // ============================================================
  // Metrics
  // ============================================================

  const mPrepare = document.getElementById('m-prepare')!
  const mReflow = document.getElementById('m-reflow')!
  const mCommit = document.getElementById('m-commit')!
  const mTotal = document.getElementById('m-total')!
  const mFps = document.getElementById('m-fps')!

  let frameCount = 0
  let lastFpsTime = performance.now()
  let currentFps = 0

  function updateMetrics() {
    const m = app.getMetrics()
    mPrepare.textContent = `${m.prepareMs.toFixed(2)}ms`
    mReflow.textContent = `${m.reflowMs.toFixed(2)}ms`
    mCommit.textContent = `${m.commitMs.toFixed(2)}ms`
    mTotal.textContent = `${(m.prepareMs + m.reflowMs + m.commitMs).toFixed(2)}ms`

    frameCount++
    const now = performance.now()
    if (now - lastFpsTime >= 1000) {
      currentFps = frameCount
      frameCount = 0
      lastFpsTime = now
      mFps.textContent = String(currentFps)
    }
  }

  function syncContainerWidth(w: number) {
    appEl.style.width = `${w}px`
  }

  // ============================================================
  // Animation
  // ============================================================

  let animating = false
  let animRaf = 0
  let animDir = 1
  const ANIM_MIN = 360
  const ANIM_MAX = 1240
  const ANIM_STEP = 6

  function animTick() {
    if (!animating) return
    const next = containerWidth.value + animDir * ANIM_STEP
    if (next >= ANIM_MAX || next <= ANIM_MIN) animDir *= -1
    const newWidth = Math.max(ANIM_MIN, Math.min(ANIM_MAX, next))
    containerWidth.value = newWidth
    syncContainerWidth(newWidth)

    widthSlider.value = String(newWidth)
    widthDisplay.textContent = `${newWidth}px`

    requestAnimationFrame(() => updateMetrics())
    animRaf = requestAnimationFrame(animTick)
  }

  // ============================================================
  // DOM Controls
  // ============================================================

  const widthSlider = document.getElementById('width-slider') as HTMLInputElement
  const widthDisplay = document.getElementById('width-display')!
  const itemsSlider = document.getElementById('items-slider') as HTMLInputElement
  const itemsDisplay = document.getElementById('items-display')!
  const animBtn = document.getElementById('anim-btn')!
  const metricsBtn = document.getElementById('metrics-btn')!
  const metricsFooter = document.getElementById('metrics-footer')!

  widthSlider.addEventListener('input', () => {
    const w = Number(widthSlider.value)
    containerWidth.value = w
    widthDisplay.textContent = `${w}px`
    syncContainerWidth(w)
    requestAnimationFrame(() => updateMetrics())
  })

  itemsSlider.addEventListener('input', () => {
    const n = Number(itemsSlider.value)
    itemCount.value = n
    itemsDisplay.textContent = String(n)
    requestAnimationFrame(() => updateMetrics())
  })

  animBtn.addEventListener('click', () => {
    animating = !animating
    animBtn.classList.toggle('active', animating)
    animBtn.textContent = animating ? '▶ Animación' : '⏸ Animación'
    if (animating) {
      animRaf = requestAnimationFrame(animTick)
    } else {
      cancelAnimationFrame(animRaf)
    }
  })

  metricsBtn.addEventListener('click', () => {
    const isVisible = metricsFooter.style.display !== 'none'
    metricsFooter.style.display = isVisible ? 'none' : 'flex'
    metricsBtn.classList.toggle('active', !isVisible)
  })

  // Initial metrics display
  requestAnimationFrame(() => updateMetrics())
}
