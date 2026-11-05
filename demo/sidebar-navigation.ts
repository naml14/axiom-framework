// Shared domain mapping for the index and the later view-selection work.
export const SIDEBAR_DOMAINS = [
  { title: 'Core & Layout Engine', sections: [
    ['section-canvas', 'Controles del canvas'],
    ['section-grid', 'Grid MVP'],
    ['section-responsive', 'Breakpoints'],
    ['section-style', 'Style API — Tokens'],
    ['section-motion', 'Motion — Transiciones'],
  ] },
  { title: 'Syntax & Reactivity', sections: [
    ['section-syntax-h', 'h() vs Literal'],
    ['section-syntax-layout', 'Layout DSL'],
    ['section-syntax-flow', 'Control de flujo'],
    ['section-syntax-events', 'Eventos + Atributos'],
    ['section-syntax-jsx', 'JSX'],
  ] },
  { title: 'Application Layer', sections: [
    ['section-portal', 'Portal'],
    ['section-router', 'Router'],
    ['section-context', 'Context API'],
    ['section-forms', 'Forms'],
  ] },
  { title: 'DX & Runtime', sections: [
    ['section-dx', 'Herramientas DX'],
    ['section-plugin', 'Plugins — Ciclo de vida'],
    ['section-error', 'Error Envelope'],
    ['section-benchmark', 'Benchmark'],
  ] },
] as const

/** Wire the static sidebar; the returned disposer supports remounts and tests. */
export function initSidebarNavigation(doc: Document = document): () => void {
  const win = doc.defaultView
  const sidebar = doc.querySelector<HTMLElement>('.dashboard-sidebar')
  const nav = doc.querySelector<HTMLElement>('.sidebar-index')
  if (!win || !sidebar || !nav) return () => {}

  const links = new Map<string, HTMLAnchorElement>()
  const sections: HTMLElement[] = []
  const heading = doc.createElement('h2')
  heading.textContent = 'Índice de secciones'
  nav.replaceChildren(heading)
  for (const domain of SIDEBAR_DOMAINS) {
    const group = doc.createElement('div')
    const title = doc.createElement('h3')
    title.textContent = domain.title
    group.append(title)
    for (const [id, label] of domain.sections) {
      const section = doc.getElementById(id)
      if (!section) continue
      const link = doc.createElement('a')
      link.href = `#${id}`
      link.textContent = label
      links.set(id, link)
      sections.push(section)
      group.append(link)
    }
    nav.append(group)
  }

  function highlight(id: string): void {
    for (const [key, link] of links) {
      if (key === id) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    }
  }

  function navigate(id: string): void {
    if (!links.has(id)) return
    doc.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' })
    highlight(id)
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
    // replaceState does not notify the router's popstate listener or change its path.
    // Hash-only URLs also work from file:// without a server or a router base.
    try {
      win!.history.replaceState(win!.history.state, '', `#${id}`)
    } catch {
      win!.location.hash = id
    }
    navigate(id)
  }

  let observer: IntersectionObserver | undefined
  // How much of each section is visible inside the observation area (the sidebar
  // minus the sticky index). The entry that occupies most of that area is the
  // one the reader is looking at.
  const visible = new Map<Element, number>()
  function intersectionHeight(entry: IntersectionObserverEntry): number {
    const rect = entry.intersectionRect
    if (rect) return rect.height
    const ratio = entry.intersectionRatio
    return ratio ? entry.boundingClientRect.height * ratio : 0
  }
  function resizeIndex(): void {
    const height = Math.ceil(nav!.getBoundingClientRect().height)
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
    }, { root: sidebar, rootMargin: `-${height}px 0px 0px 0px`, threshold: 0 })
    for (const section of sections) observer.observe(section)
  }
  resizeIndex()
  const resizeObserver = typeof win.ResizeObserver === 'function'
    ? new win.ResizeObserver(resizeIndex) : undefined
  resizeObserver?.observe(nav)
  nav.addEventListener('click', onClick)
  win.addEventListener('hashchange', followHash)
  win.addEventListener('popstate', followHash)
  followHash()

  return () => {
    observer?.disconnect()
    resizeObserver?.disconnect()
    nav.removeEventListener('click', onClick)
    win.removeEventListener('hashchange', followHash)
    win.removeEventListener('popstate', followHash)
  }
}
