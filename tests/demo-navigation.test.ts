import { afterEach, describe, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'
import { initSidebarNavigation } from '../demo/sidebar-navigation.js'

const html = readFileSync(new URL('../demo/static.html', import.meta.url), 'utf8')
const windows: Window[] = []
const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  for (const win of windows.splice(0)) void win.happyDOM.close()
})

function setup(url = 'https://demo.test/about?demo=1') {
  const win = new Window({ url })
  const doc = win.document as unknown as Document
  windows.push(win)
  win.document.write(html)
  const observed: Element[] = []
  let callback: IntersectionObserverCallback = () => {}
  let options: IntersectionObserverInit | undefined
  let disconnected = false
  class Observer {
    constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
      callback = cb
      options = opts
    }
    observe(target: Element) { observed.push(target) }
    disconnect() { disconnected = true }
  }
  Object.defineProperty(win, 'IntersectionObserver', { value: Observer })
  const scrolled: string[] = []
  for (const section of win.document.querySelectorAll('.sidebar-section')) {
    section.scrollIntoView = () => { scrolled.push(section.id) }
  }
  const cleanup = initSidebarNavigation(win.document as unknown as Document)
  cleanups.push(cleanup)
  const links = () => [...doc.querySelectorAll<HTMLAnchorElement>('.sidebar-index a')]
  return {
    win, observed, scrolled, links,
    get options() { return options },
    get disconnected() { return disconnected },
    emit(entries: Array<{ target: unknown; isIntersecting: boolean; top: number; height: number }>) {
      callback(entries.map(entry => ({
        ...entry,
        boundingClientRect: { top: entry.top, height: entry.height },
        intersectionRect: { top: entry.top, height: entry.isIntersecting ? entry.height : 0 },
        intersectionRatio: entry.isIntersecting ? 1 : 0,
      })) as unknown as IntersectionObserverEntry[], {} as IntersectionObserver)
    },
    cleanup,
  }
}

describe('sidebar navigation (S6)', () => {
  test('groups all 18 existing sections once and navigates every anchor without changing the app route', () => {
    const env = setup()
    const { win, links, scrolled } = env
    expect([...win.document.querySelectorAll('.sidebar-index h3')].map(el => el.textContent)).toEqual([
      'Core & Layout Engine', 'Syntax & Reactivity', 'Application Layer', 'DX & Runtime',
    ])
    expect(links()).toHaveLength(18)
    expect(new Set(links().map(link => link.hash)).size).toBe(18)
    expect(env.observed).toHaveLength(18)
    expect(env.options?.root).toBe(win.document.querySelector('.dashboard-sidebar') as unknown as Element)
    let routeEvents = 0
    win.addEventListener('popstate', () => routeEvents++)
    for (const link of links()) {
      const target = win.document.getElementById(link.hash.slice(1))
      expect(target?.matches('section.sidebar-section')).toBe(true)
      const button = target?.querySelector('button')
      link.click()
      expect(scrolled.at(-1)).toBe(target?.id)
      expect(win.location.hash).toBe(link.hash)
      expect(win.location.pathname + win.location.search).toBe('/about?demo=1')
      expect(link.getAttribute('aria-current')).toBe('location')
      expect(links().filter(item => item.hasAttribute('aria-current'))).toHaveLength(1)
      expect(target?.querySelector('button')).toBe(button)
    }
    expect(routeEvents).toBe(0)
  })

  test('opens section deep links on file URLs and follows later hash changes', () => {
    const env = setup('file:///demo/static.html#section-forms')
    expect(env.scrolled).toEqual(['section-forms'])
    env.win.location.hash = '#section-grid'
    env.win.dispatchEvent(new env.win.HashChangeEvent('hashchange'))
    expect(env.scrolled.at(-1)).toBe('section-grid')
    expect(env.win.location.pathname).toBe('/demo/static.html')
    const before = [...env.scrolled]
    env.win.location.hash = '#/about'
    env.win.dispatchEvent(new env.win.HashChangeEvent('hashchange'))
    expect(env.scrolled).toEqual(before)
  })

  test('highlights the section that occupies the observation area, not the first one in DOM order', () => {
    const env = setup()
    const [first, second] = env.observed
    // The previous section still overlaps the top edge (226px of it) while the
    // section in view occupies most of the area (460px).
    env.emit([
      { target: first, isIntersecting: true, top: -251, height: 226 },
      { target: second, isIntersecting: true, top: 389, height: 460 },
    ])
    expect(env.links().find(link => link.hash === `#${second?.id}`)?.getAttribute('aria-current')).toBe('location')
    expect(env.links().find(link => link.hash === `#${first?.id}`)?.getAttribute('aria-current')).toBeNull()
    // The section in view leaves the area: the previous one takes over.
    env.emit([{ target: second, isIntersecting: false, top: 389, height: 0 }])
    expect(env.links().find(link => link.hash === `#${first?.id}`)?.getAttribute('aria-current')).toBe('location')
    expect(env.win.location.hash).toBe('')
    env.cleanup()
    expect(env.disconnected).toBe(true)
    const count = env.scrolled.length
    env.links()[0]?.click()
    expect(env.scrolled).toHaveLength(count)
  })

  test('keeps the clicked entry highlighted while the previous section still overlaps the top edge', () => {
    const env = setup()
    const last = env.observed[env.observed.length - 1]
    const previous = env.observed[env.observed.length - 2]
    const link = env.links().find(item => item.hash === `#${last?.id}`)
    link?.click()
    expect(link?.getAttribute('aria-current')).toBe('location')
    // A click near the end of the scroll range cannot bring the section to the
    // top, so the previous section keeps overlapping the top edge.
    env.emit([
      { target: previous, isIntersecting: true, top: -251, height: 226 },
      { target: last, isIntersecting: true, top: 389, height: 460 },
    ])
    expect(link?.getAttribute('aria-current')).toBe('location')
    expect(env.links().filter(item => item.hasAttribute('aria-current'))).toHaveLength(1)
  })

  test('S6: refresh continuously intersecting sections', async () => {
    const e = setup(), [a, b] = e.observed
    const root = (e.win.document as unknown as Document).querySelector('.dashboard-sidebar')!
    const rect = (top: number, bottom: number) =>
      ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top }) as DOMRect
    root.getBoundingClientRect = () => rect(0, 400)
    a!.getBoundingClientRect = () => rect(-200, 100)
    b!.getBoundingClientRect = () => rect(100, 500)
    e.emit([
      { target: a, isIntersecting: true, top: 0, height: 300 },
      { target: b, isIntersecting: true, top: 300, height: 100 },
    ])
    root.dispatchEvent(new e.win.Event('scroll') as unknown as Event)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(e.links().find(link => link.hasAttribute('aria-current'))?.hash).toBe(`#${b!.id}`)
    expect(e.win.location.href).toBe('https://demo.test/about?demo=1')
    expect(e.scrolled).toEqual([])
    e.cleanup()
    a!.getBoundingClientRect = () => rect(0, 400)
    b!.getBoundingClientRect = () => rect(400, 500)
    root.dispatchEvent(new e.win.Event('scroll') as unknown as Event)
    expect(e.links().find(link => link.hasAttribute('aria-current'))?.hash).toBe(`#${b!.id}`)
  })

  test('S6: reveal clipped active entry', () => {
    const e = setup(), target = e.observed[1]!
    const nav = (e.win.document as unknown as Document).querySelector<HTMLElement>('.sidebar-index')!
    Object.defineProperties(nav, {
      clientHeight: { value: 100 }, scrollHeight: { value: 500 },
    })
    const link = e.links().find(link => link.hash === `#${target.id}`)!
    Object.defineProperties(link, {
      offsetTop: { value: 300 }, offsetHeight: { value: 20 },
    })
    link.getBoundingClientRect = () =>
      ({ top: 300, bottom: 320, height: 20 }) as DOMRect
    nav.getBoundingClientRect = () =>
      ({ top: 0, bottom: 100, height: 100 }) as DOMRect
    link.scrollIntoView = () => { nav.scrollTop = 220 }
    e.emit([{ target, isIntersecting: true, top: 0, height: 300 }])
    expect(nav.scrollTop).toBeGreaterThan(0)
    expect(e.scrolled).toEqual([])
    expect(e.win.location.href).toBe('https://demo.test/about?demo=1')
  })

  test('leaves unrelated pages unchanged', () => {
    const win = new Window()
    windows.push(win)
    win.document.body.innerHTML = '<p>Otra página</p>'
    cleanups.push(initSidebarNavigation(win.document as unknown as Document))
    expect(win.document.body.innerHTML).toBe('<p>Otra página</p>')
  })
})
