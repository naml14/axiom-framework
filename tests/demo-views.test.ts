import { afterEach, describe, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'
import { initSidebarNavigation } from '../demo/sidebar-navigation.ts'
import { DEFAULT_VIEW, VIEWS, VIEW_HIDDEN_CLASS, activeView, viewOfSection } from '../demo/demo-views.ts'

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
  class Observer {
    constructor(_cb: IntersectionObserverCallback) {}
    observe(_target: Element) {}
    disconnect() {}
  }
  Object.defineProperty(win, 'IntersectionObserver', { value: Observer })
  const scrolled: string[] = []
  for (const section of win.document.querySelectorAll('.sidebar-section')) {
    section.scrollIntoView = () => { scrolled.push(section.id) }
  }
  const cleanup = initSidebarNavigation(win.document as unknown as Document)
  cleanups.push(cleanup)
  const visible = () => [...doc.querySelectorAll<HTMLElement>('.sidebar-section')]
    .filter(section => !section.classList.contains(VIEW_HIDDEN_CLASS))
    .map(section => section.id)
  const tabs = () => [...doc.querySelectorAll<HTMLButtonElement>('.view-tab')]
  return { win, doc, scrolled, visible, tabs, cleanup }
}

describe('demo views (S15)', () => {
  test('the model covers the eighteen sections once, in four views', () => {
    const ids = VIEWS.flatMap(view => view.sections.map(section => section.id))
    expect(ids).toHaveLength(18)
    expect(new Set(ids).size).toBe(18)
    expect(VIEWS.map(view => view.id)).toEqual(['core', 'syntax', 'app', 'dx'])
    for (const id of ids) expect(viewOfSection(id)).toBeDefined()
    expect(viewOfSection('section-not-real')).toBeUndefined()
  })

  test('the index keeps the eighteen entries grouped in the four domains', () => {
    const env = setup()
    const groups = [...env.doc.querySelectorAll('.sidebar-index .index-group')]
    expect(groups).toHaveLength(4)
    expect(groups.map(group => group.querySelector('h3')?.textContent)).toEqual([
      'Core & Layout Engine', 'Syntax & Reactivity', 'Application Layer', 'DX & Runtime',
    ])
    expect(env.doc.querySelectorAll('.sidebar-index a')).toHaveLength(18)
    // The active view lists its own entries; the other groups keep theirs hidden.
    const listed = [...env.doc.querySelectorAll('.sidebar-index .index-entries')]
      .filter(entries => !entries.classList.contains(VIEW_HIDDEN_CLASS))
    expect(listed).toHaveLength(1)
    expect(listed[0]?.querySelectorAll('a')).toHaveLength(5)
  })

  test('the first view is the initial one and the other sections stay in the DOM', () => {
    const env = setup()
    expect(env.tabs()).toHaveLength(4)
    expect(env.tabs().map(tab => tab.textContent)).toEqual([
      'Core & Layout Engine', 'Syntax & Reactivity', 'Application Layer', 'DX & Runtime',
    ])
    expect(env.tabs()[0]?.getAttribute('aria-selected')).toBe('true')
    expect(env.tabs().filter(tab => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    expect(activeView.value).toBe(DEFAULT_VIEW)
    expect(env.visible()).toEqual([
      'section-canvas', 'section-grid', 'section-responsive', 'section-style', 'section-motion',
    ])
    // Nothing is removed: every section is still in the page.
    expect(env.doc.querySelectorAll('.sidebar-section')).toHaveLength(18)
    expect(env.doc.querySelector('.dashboard-layout')?.getAttribute('data-view')).toBe('core')
  })

  test('a view tab switches the signal, the visible sections and the URL', () => {
    const env = setup()
    env.tabs()[2]?.click()
    expect(activeView.value).toBe('app')
    expect(env.doc.querySelector('.dashboard-layout')?.getAttribute('data-view')).toBe('app')
    expect(env.tabs()[2]?.getAttribute('aria-selected')).toBe('true')
    expect(env.visible()).toEqual(['section-portal', 'section-router', 'section-context', 'section-forms'])
    expect(env.doc.querySelectorAll('.sidebar-section')).toHaveLength(18)
    expect(env.win.location.hash).toBe('#section-portal')
    expect(env.scrolled.at(-1)).toBe('section-portal')
  })

  test('an index entry of another view opens that view and jumps to the section', () => {
    const env = setup()
    const link = [...env.doc.querySelectorAll<HTMLAnchorElement>('.sidebar-index a')]
      .find(item => item.hash === '#section-forms')
    link?.click()
    expect(activeView.value).toBe('app')
    expect(env.visible()).toContain('section-forms')
    expect(env.visible()).not.toContain('section-canvas')
    expect(env.scrolled.at(-1)).toBe('section-forms')
    expect(env.win.location.hash).toBe('#section-forms')
  })

  test('a deep link opens the view that owns the section', () => {
    const env = setup('https://demo.test/about?demo=1#section-syntax-jsx')
    expect(activeView.value).toBe('syntax')
    expect(env.visible()).toContain('section-syntax-jsx')
    expect(env.scrolled.at(-1)).toBe('section-syntax-jsx')
    expect(env.tabs()[1]?.getAttribute('aria-selected')).toBe('true')
  })

  test('a later hash change switches the view again', () => {
    const env = setup()
    env.win.location.hash = '#section-benchmark'
    env.win.dispatchEvent(new env.win.HashChangeEvent('hashchange'))
    expect(activeView.value).toBe('dx')
    expect(env.visible()).toContain('section-benchmark')
    expect(env.scrolled.at(-1)).toBe('section-benchmark')
  })
})
