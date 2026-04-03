import { createApp } from './src/app.ts'
import { JSDOM } from 'jsdom'
import { App, containerWidth, itemCount } from './demo/app.ts'

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`)
global.window = dom.window as any
global.document = dom.window.document
global.HTMLElement = dom.window.HTMLElement
global.performance = { now: () => Date.now() } as any
global.requestAnimationFrame = (cb) => setTimeout(cb, 16) as any
global.cancelAnimationFrame = clearTimeout

containerWidth.value = 856
itemCount.value = 20

const appEl = document.getElementById('app')!
appEl.style.width = `${containerWidth.value}px`

const app = createApp(App, appEl, { lineHeight: 20 })
app.mount()

// Wait a bit just in case
setTimeout(() => {
  console.log(appEl.innerHTML)
}, 100)
