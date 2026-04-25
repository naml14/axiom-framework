// ============================================================
// src/jsx.d.ts — Tipos JSX para Axiom (C11, opt-in)
// ============================================================
//
// Activación: añadir en un archivo global.d.ts del proyecto:
//   /// <reference types="axiom-framework/jsx-types" />
//
// Esto evita colisiones con React u otros frameworks JSX.
// Los tipos se generan desde HTMLElementTagNameMap (C11).
// ============================================================

import type { HProps }        from './syntax/types.js'
import type { StackProps, RowProps, GridProps } from './syntax/layout.js'
import type { ComponentNode } from './core/types.js'

declare global {
  namespace JSX {
    type Element = ComponentNode

    interface ElementChildrenAttribute { children: {} }

    // key es una prop especial del runtime JSX — aceptada en todos los elementos HTML.
    // Para componentes funcionales, key se inyecta via IntrinsicAttributes solo en elementos
    // intrínsecos. En componentes funcionales, key es consumida por el runtime antes de
    // llegar a las props del componente.
    interface IntrinsicAttributes { key?: string }

    // Para componentes funcionales: excluir key de las props del componente
    // (key es manejada por el runtime, no llega a las props reales del componente)
    type LibraryManagedAttributes<C, P> = Omit<P, 'key'> & { key?: string }

    // Base generada desde HTMLElementTagNameMap (C11)
    // Todos los elementos HTML estándar tienen HProps como base.
    type HtmlIntrinsicElements = {
      [K in keyof HTMLElementTagNameMap]: HProps
    }

    interface IntrinsicElements extends HtmlIntrinsicElements {
      // Overrides con tipos más estrictos para elementos comunes
      img:    HProps & { src: string; alt: string }
      input:  HProps & { value?: string; checked?: boolean }
      button: HProps & { disabled?: boolean }
      a:      HProps & { href?: string; target?: string }
      label:  HProps & { htmlFor?: string }

      // Layout helpers de Axiom (minúscula = función, no componente)
      stack:  StackProps
      vstack: StackProps   // alias de stack (C8: reemplaza col)
      row:    RowProps
      grid:   GridProps & { columns: number | string }
      box:    HProps
    }
  }
}
