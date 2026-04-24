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
