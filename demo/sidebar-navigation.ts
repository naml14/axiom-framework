import { DEFAULT_VIEW, VIEWS, VIEW_HIDDEN_CLASS, activeView, applyView, viewOfSection } from './demo-views.js'
import type { ViewId } from './demo-views.js'

/** Wire the static sidebar; the returned disposer supports remounts and tests. */
export function initSidebarNavigation(doc: Document = document): () => void {
  const win = doc.defaultView
  const sidebar = doc.querySelector<HTMLElement>('.dashboard-sidebar')
  const nav = doc.querySelector<HTMLElement>('.sidebar-index')
  if (!win || !sidebar || !nav) return () => {}

  const links = new Map<string, HTMLAnchorElement>()
  const sections: HTMLElement[] = []

  // The index is the map of the eighteen sections grouped by view (D5b). Each
  // group title doubles as the tab that selects its view, so every view is one
  // click away and the index only lists the entries of the active view.
  const tabButtons = new Map<ViewId, HTMLButtonElement>()
  const groupEntries = new Map<ViewId, HTMLElement>()
  const heading = doc.createElement('h2')
  heading.textContent = 'Índice de secciones'
  nav.replaceChildren(heading)
  for (const domain of VIEWS) {
    const group = doc.createElement('div')
    group.className = 'index-group'
    const title = doc.createElement('h3')
    const tab = doc.createElement('button')
    tab.type = 'button'
    tab.className = 'view-tab'
    tab.setAttribute('role', 'tab')
    tab.dataset.view = domain.id
    tab.textContent = domain.title
    tab.addEventListener('click', () => selectView(domain.id))
    tabButtons.set(domain.id, tab)
    title.append(tab)
    const entries = doc.createElement('div')
    entries.className = 'index-entries'
    groupEntries.set(domain.id, entries)
    for (const { id, label } of domain.sections) {
      const section = doc.getElementById(id)
      if (!section) continue
      const link = doc.createElement('a')
      link.href = `#${id}`
      link.textContent = label
      links.set(id, link)
      sections.push(section)
      entries.append(link)
    }
    group.append(title, entries)
    nav.append(group)
  }

  function setActiveView(view: ViewId): void {
    activeView.value = view
    applyView(doc, view)
    for (const [id, tab] of tabButtons) {
      tab.setAttribute('aria-selected', String(id === view))
    }
    for (const [id, entries] of groupEntries) {
      entries.classList.toggle(VIEW_HIDDEN_CLASS, id !== view)
    }
  }

  function highlight(id: string): void {
    const active = links.get(id)
    if (!active || active.hasAttribute('aria-current')) return
    // Read before writing, and move only the independently scrolling index.
    // scrollIntoView would also move the sidebar and the page's ancestors.
    const bounds = nav!.getBoundingClientRect()
    const entry = active.getBoundingClientRect()
    const delta = entry.top < bounds.top ? entry.top - bounds.top
      : entry.bottom > bounds.bottom ? entry.bottom - bounds.bottom : 0
    for (const [key, link] of links) {
      if (key === id) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    }
    if (delta) nav!.scrollTop += delta
  }

  function navigate(id: string): void {
    if (!links.has(id)) return
    // A section of another view is only reachable once that view is active.
    const view = viewOfSection(id)
    if (view && view !== activeView.value) setActiveView(view)
    doc.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' })
    highlight(id)
  }

  function replaceHash(id: string): void {
    // replaceState does not notify the router's popstate listener or change its path.
    // Hash-only URLs also work from file:// without a server or a router base.
    try {
      win!.history.replaceState(win!.history.state, '', `#${id}`)
    } catch {
      win!.location.hash = id
    }
  }

  function selectView(view: ViewId): void {
    const first = VIEWS.find(candidate => candidate.id === view)?.sections[0]
    if (!first) return
    setActiveView(view)
    // The URL keeps identifying a section, and the section identifies the view.
    replaceHash(first.id)
    navigate(first.id)
  }

  function followHash(): void {
    // Section hashes are separate from app routes; never interpret arbitrary hashes.
    navigate(win!.location.hash.slice(1))
  }

  function onClick(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const link = (event.target as Element).closest('a')
    const id = link?.hash.slice(1)
    if (!id || !links.has(id)) return
    event.preventDefault()
    replaceHash(id)
    navigate(id)
  }

  let observer: IntersectionObserver | undefined
  // How much of each section is visible inside the observation area (the sidebar
  // minus the sticky index). The entry that occupies most of that area is the
  // one the reader is looking at.
  const visible = new Map<Element, number>()
  let indexHeight = 0
  function highlightVisible(): void {
    let current: Element | undefined
    let best = 0
    for (const section of sections) {
      const shown = visible.get(section)
      if (shown !== undefined && shown > best) {
        best = shown
        current = section
      }
    }
    if (current) highlight(current.id)
  }
  function onScroll(): void {
    // Threshold-zero entries do not refresh while sections remain intersecting.
    // This is demo observation, separate from the engine's arithmetic hot path.
    const root = sidebar!.getBoundingClientRect()
    const top = root.top + indexHeight
    visible.clear()
    for (const section of sections) {
      if (viewOfSection(section.id) !== activeView.value) continue
      const rect = section.getBoundingClientRect()
      const height = Math.max(0, Math.min(rect.bottom, root.bottom) - Math.max(rect.top, top))
      if (height > 0) visible.set(section, height)
    }
    highlightVisible()
  }
  function intersectionHeight(entry: IntersectionObserverEntry): number {
    const rect = entry.intersectionRect
    if (rect) return rect.height
    const ratio = entry.intersectionRatio
    return ratio ? entry.boundingClientRect.height * ratio : 0
  }
  function resizeIndex(): void {
    const height = Math.ceil(nav!.getBoundingClientRect().height)
    indexHeight = height
    sidebar!.style.setProperty('--sidebar-index-height', `${height}px`)
    observer?.disconnect()
    visible.clear()
    if (!win || typeof win.IntersectionObserver !== 'function') return
    observer = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target, intersectionHeight(entry))
        else visible.delete(entry.target)
      }
      // The first intersecting section in DOM order is not the visible one: a
      // previous section can still overlap the top edge while the section the
      // reader jumped to occupies most of the area.
      highlightVisible()
    }, { root: sidebar, rootMargin: `-${height}px 0px 0px 0px`, threshold: 0 })
    for (const section of sections) observer.observe(section)
  }
  // The first contact shows the first view; a deep link opens its own view.
  const initialHash = win.location.hash.slice(1)
  setActiveView(links.has(initialHash) ? viewOfSection(initialHash) ?? DEFAULT_VIEW : DEFAULT_VIEW)
  resizeIndex()
  const resizeObserver = typeof win.ResizeObserver === 'function'
    ? new win.ResizeObserver(resizeIndex) : undefined
  resizeObserver?.observe(nav)
  sidebar.addEventListener('scroll', onScroll)
  nav.addEventListener('click', onClick)
  win.addEventListener('hashchange', followHash)
  win.addEventListener('popstate', followHash)
  followHash()

  return () => {
    observer?.disconnect()
    resizeObserver?.disconnect()
    sidebar.removeEventListener('scroll', onScroll)
    nav.removeEventListener('click', onClick)
    win.removeEventListener('hashchange', followHash)
    win.removeEventListener('popstate', followHash)
  }
}
