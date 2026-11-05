import { signal } from '../src/index.ts'

/**
 * The demo's four views (D5b).
 *
 * The sidebar holds eighteen showcases; a view is the group of them that
 * belongs to one audience. The active view is a signal, so switching views is
 * a state change in the same page — the demo keeps a single URL and still
 * opens as a local file.
 */
export type ViewId = 'core' | 'syntax' | 'app' | 'dx'

export interface ViewSection {
  id: string
  label: string
}

export interface DemoView {
  id: ViewId
  title: string
  sections: readonly ViewSection[]
}

export const VIEWS: readonly DemoView[] = [
  { id: 'core', title: 'Core & Layout Engine', sections: [
    { id: 'section-canvas', label: 'Controles del canvas' },
    { id: 'section-grid', label: 'Grid MVP' },
    { id: 'section-responsive', label: 'Breakpoints' },
    { id: 'section-style', label: 'Style API — Tokens' },
    { id: 'section-motion', label: 'Motion — Transiciones' },
  ] },
  { id: 'syntax', title: 'Syntax & Reactivity', sections: [
    { id: 'section-syntax-h', label: 'h() vs Literal' },
    { id: 'section-syntax-layout', label: 'Layout DSL' },
    { id: 'section-syntax-flow', label: 'Control de flujo' },
    { id: 'section-syntax-events', label: 'Eventos + Atributos' },
    { id: 'section-syntax-jsx', label: 'JSX' },
  ] },
  { id: 'app', title: 'Application Layer', sections: [
    { id: 'section-portal', label: 'Portal' },
    { id: 'section-router', label: 'Router' },
    { id: 'section-context', label: 'Context API' },
    { id: 'section-forms', label: 'Forms' },
  ] },
  { id: 'dx', title: 'DX & Runtime', sections: [
    { id: 'section-dx', label: 'Herramientas DX' },
    { id: 'section-plugin', label: 'Plugins — Ciclo de vida' },
    { id: 'section-error', label: 'Error Envelope' },
    { id: 'section-benchmark', label: 'Benchmark' },
  ] },
]

/** The first contact shows the thesis of the framework, not the whole sidebar. */
export const DEFAULT_VIEW: ViewId = 'core'

/** The signal that selects the view. */
export const activeView = signal<ViewId>(DEFAULT_VIEW)

/** Class marking the sections that belong to a view other than the active one. */
export const VIEW_HIDDEN_CLASS = 'is-view-hidden'

/** The view that owns a section, or undefined when the id is unknown. */
export function viewOfSection(sectionId: string): ViewId | undefined {
  return VIEWS.find(view => view.sections.some(section => section.id === sectionId))?.id
}

/**
 * Show the sections of the given view and hide the others.
 * The hidden sections stay in the DOM: a view hides nothing, it only
 * reorders what the reader sees.
 */
export function applyView(doc: Document, view: ViewId): void {
  doc.querySelector<HTMLElement>('.dashboard-layout')?.setAttribute('data-view', view)
  for (const candidate of VIEWS) {
    for (const section of candidate.sections) {
      const element = doc.getElementById(section.id)
      element?.classList.toggle(VIEW_HIDDEN_CLASS, candidate.id !== view)
    }
  }
}
