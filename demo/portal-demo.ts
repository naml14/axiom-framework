import { signal, defineComponent, createPortal, createApp } from '../src/index.ts'

// ============================================================
// Portal Demo — standalone section demonstrating createPortal
//
// Renders its own Axiom app into a dedicated container that is
// appended to #app, so it stays visually inside the page but
// is fully independent of the main Axiom instance.
//
// The modal is rendered via createPortal into a DEDICATED
// #portal-modal-root container — NOT directly into document.body.
// Best practice: always target a controlled container, not body.
// This ensures Axiom only removes what it inserted on cleanup.
// ============================================================

const isModalOpen = signal(false)

// ============================================================
// Modal root — dedicated container for portal output
//
// Best practice: never use document.body directly as a portal
// target. Instead, create a dedicated container so Axiom only
// manages content it inserted, without risking other DOM nodes.
// ============================================================

function getOrCreateModalRoot(): HTMLElement {
  let el = document.getElementById('portal-modal-root')
  if (el === null) {
    el = document.createElement('div')
    el.id = 'portal-modal-root'
    document.body.appendChild(el)
  }
  return el
}

// ============================================================
// Modal content component — rendered into #portal-modal-root
// ============================================================

const ModalPortal = defineComponent(() => {
  if (!isModalOpen.value) {
    return { type: 'fragment' as const, children: [] }
  }

  return createPortal(
    [
      {
        type: 'element' as const,
        tag: 'div',
        classes: ['portal-overlay'],
        on: {
          click: (e: Event) => {
            if ((e.target as HTMLElement).classList.contains('portal-overlay')) {
              isModalOpen.value = false
            }
          },
        },
        children: [
          {
            type: 'element' as const,
            tag: 'div',
            classes: ['portal-modal'],
            children: [
              {
                type: 'element' as const,
                tag: 'div',
                classes: ['portal-modal-header'],
                children: [
                  {
                    type: 'element' as const,
                    tag: 'h2',
                    classes: ['portal-modal-title'],
                    children: [{ type: 'text' as const, content: '✨ Portal Modal' }],
                  },
                  {
                    type: 'element' as const,
                    tag: 'button',
                    classes: ['portal-close-btn'],
                    on: {
                      click: () => {
                        isModalOpen.value = false
                      },
                    },
                    children: [{ type: 'text' as const, content: '✕' }],
                  },
                ],
              },
              {
                type: 'element' as const,
                tag: 'p',
                classes: ['portal-modal-body'],
                children: [
                  {
                    type: 'text' as const,
                    content:
                      'This modal is rendered via createPortal into #portal-modal-root — a dedicated container outside the #app root. The component tree stays clean; the DOM target is arbitrary.',
                  },
                ],
              },
              {
                type: 'element' as const,
                tag: 'p',
                classes: ['portal-modal-body'],
                children: [
                  {
                    type: 'text' as const,
                    content:
                      'Reactivity works normally: a signal controls visibility, and Axiom diffs only what changed — even across DOM boundaries.',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    getOrCreateModalRoot()
  )
})

// ============================================================
// Trigger + portal root component — the full demo section
// ============================================================

const PortalDemo = defineComponent(() => ({
  type: 'element' as const,
  tag: 'div',
  classes: ['card', 'portal-demo-section'],
  layout: { flexDirection: 'column' as const, gap: 10, padding: 16 },
  children: [
    {
      type: 'element' as const,
      tag: 'div',
      classes: ['hero-badge'],
      children: [{ type: 'text' as const, content: '🌀 PORTAL DEMO' }],
    },
    {
      type: 'element' as const,
      tag: 'h2',
      classes: ['hero-title'],
      children: [{ type: 'text' as const, content: 'createPortal' }],
    },
    {
      type: 'element' as const,
      tag: 'p',
      classes: ['hero-body'],
      children: [
        {
          type: 'text' as const,
          content:
            'Renders children into an arbitrary DOM node outside the component tree. Perfect for modals, tooltips, and overlays that need to escape overflow/stacking contexts.',
        },
      ],
    },
    {
      type: 'element' as const,
      tag: 'button',
      classes: ['portal-trigger-btn'],
      on: {
        click: () => {
          isModalOpen.value = true
        },
      },
      children: [{ type: 'text' as const, content: '🚀 Open Portal Modal' }],
    },
    // ModalPortal lives here in the logical tree but renders into document.body
    ModalPortal(),
  ],
}))

// ============================================================
// Mount the portal demo section
// ============================================================

export function initPortalDemo() {
  // Create the dedicated portal modal root — Axiom renders modal content here.
  // Using a dedicated container (not document.body) is the recommended pattern:
  // it ensures Axiom only removes what it inserted on cleanup.
  getOrCreateModalRoot()

  // Mount into the static #portal-demo-root already present in the sidebar HTML.
  // This replaces the old approach of dynamically inserting after #app.
  const container = document.getElementById('portal-demo-root')
  if (!container) {
    console.warn('[PortalDemo] container #portal-demo-root not found in DOM')
    return
  }

  const portalApp = createApp(PortalDemo, container, { lineHeight: 20 })
  portalApp.mount()
}
