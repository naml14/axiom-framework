import { signal, defineComponent, createPortal, createApp, h, stack } from '../src/index.ts'

// Portal Demo — demonstrates createPortal with the idiomatic helper API.
//
// The modal is rendered via createPortal into a dedicated #portal-modal-root
// container — NOT directly into document.body. Best practice: always target a
// controlled container so Axiom only removes what it inserted on cleanup.

const isModalOpen = signal(false)

// Dedicated container for portal output.
// Never use document.body directly as a portal target.
function getOrCreateModalRoot(): HTMLElement {
  let el = document.getElementById('portal-modal-root')
  if (el === null) {
    el = document.createElement('div')
    el.id = 'portal-modal-root'
    document.body.appendChild(el)
  }
  return el
}

// Modal content — rendered into #portal-modal-root via createPortal.
const ModalPortal = defineComponent(() => {
  if (!isModalOpen.value) {
    return { type: 'fragment' as const, children: [] }
  }

  return createPortal(
    [
      h('div', {
        class: ['portal-overlay'],
        onClick: (e: Event) => {
          if ((e.target as HTMLElement).classList.contains('portal-overlay')) {
            isModalOpen.value = false
          }
        },
      },
        h('div', { class: ['portal-modal'] },
          stack({ gap: 0 },
            h('div', { class: ['portal-modal-header'] },
              h('h2', { class: ['portal-modal-title'] }, '✨ Portal Modal'),
              h('button', {
                class: ['portal-close-btn'],
                onClick: () => { isModalOpen.value = false },
              }, '✕'),
            ),
            h('p', { class: ['portal-modal-body'] },
              'This modal is rendered via createPortal into #portal-modal-root — a dedicated container outside the #app root. The component tree stays clean; the DOM target is arbitrary.',
            ),
            h('p', { class: ['portal-modal-body'] },
              'Reactivity works normally: a signal controls visibility, and Axiom diffs only what changed — even across DOM boundaries.',
            ),
          ),
        ),
      ),
    ],
    getOrCreateModalRoot(),
  )
})

// Trigger section — mounts in the logical tree, portal renders elsewhere.
const PortalDemo = defineComponent(() =>
  stack({ gap: 10, padding: 16, class: ['card', 'portal-demo-section'] },
    h('div', { class: ['hero-badge'] }, '🌀 PORTAL DEMO'),
    h('h2', { class: ['hero-title'] }, 'createPortal'),
    h('p', { class: ['hero-body'] },
      'Renders children into an arbitrary DOM node outside the component tree. Perfect for modals, tooltips, and overlays that need to escape overflow/stacking contexts.',
    ),
    h('button', {
      class: ['portal-trigger-btn'],
      onClick: () => { isModalOpen.value = true },
    }, '🚀 Open Portal Modal'),
    ModalPortal(),
  )
)

export function initPortalDemo() {
  // Create the dedicated portal modal root before mounting.
  getOrCreateModalRoot()

  const container = document.getElementById('portal-demo-root')
  if (!container) {
    console.warn('[PortalDemo] container #portal-demo-root not found in DOM')
    return
  }

  const portalApp = createApp(PortalDemo, container, { lineHeight: 20 })
  portalApp.mount()
}
