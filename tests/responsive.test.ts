import { describe, test, expect } from 'bun:test'
import { defineComponent } from '../src/render/component.js'
import { prepare } from '../src/render/prepare.js'
import { reflow } from '../src/render/reflow.js'
import { resolveResponsiveLayout } from '../src/render/strategy/responsive.js'

describe('responsive resolver', () => {
  test('resuelve width en porcentaje usando maxWidth del contenedor', () => {
    const resolved = resolveResponsiveLayout(
      { width: '50%' } as any,
      { maxWidth: 400, maxHeight: 300 }
    )

    expect(resolved?.width).toBe(200)
  })

  test('resuelve unidades vw y vh usando viewport del constraints', () => {
    const resolved = resolveResponsiveLayout(
      { width: '25vw', height: '10vh' } as any,
      { maxWidth: 800, maxHeight: 600, viewportWidth: 1200, viewportHeight: 900 }
    )

    expect(resolved?.width).toBe(300)
    expect(resolved?.height).toBe(90)
  })

  // Spec: Viewport Unit Fallback — vw resolves relative to container when viewportWidth is absent
  test('resuelve vw relativo al contenedor cuando viewportWidth no está presente', () => {
    const resolved = resolveResponsiveLayout(
      { width: '50vw' } as any,
      { maxWidth: 800, maxHeight: 600 } // no viewportWidth
    )

    // Falls back to maxWidth (800), so 50vw = 400
    expect(resolved?.width).toBe(400)
  })

  // Spec: Container-Query Resolution — breakpoints resolve against container width, not viewport
  test('no aplica breakpoint cuando el contenedor es más angosto que el viewport', () => {
    const layout = {
      width: '40%',
      breakpoints: [
        { minWidth: 700, layout: { width: '90%' } },
      ],
    } as any

    // viewport is 1200 (wider than 700), but container is only 500
    const narrowContainer = resolveResponsiveLayout(layout, {
      maxWidth: 500,
      maxHeight: 400,
      viewportWidth: 1200,
    })
    // viewport-based logic would apply 90% of 1200 = 1080 — wrong
    // container-based logic: maxWidth(500) < minWidth(700) → breakpoint does NOT apply
    // base width: 40% of 500 = 200
    expect(narrowContainer?.width).toBe(200)

    // same viewport, wider container — now the breakpoint SHOULD apply
    const wideContainer = resolveResponsiveLayout(layout, {
      maxWidth: 800,
      maxHeight: 400,
      viewportWidth: 1200,
    })
    // 90% of 800 = 720
    expect(wideContainer?.width).toBe(720)
  })

  test('aplica breakpoints en orden y usa el último match', () => {
    const layout = {
      width: '40%',
      breakpoints: [
        { minWidth: 500, layout: { width: '60%' } },
        { minWidth: 700, layout: { width: '80%' } },
      ],
    } as any

    const resolvedWide = resolveResponsiveLayout(layout, { maxWidth: 800, maxHeight: 400 })
    const resolvedMedium = resolveResponsiveLayout(layout, { maxWidth: 600, maxHeight: 400 })

    expect(resolvedWide?.width).toBe(640) // 80% de 800
    expect(resolvedMedium?.width).toBe(360) // 60% de 600
  })

  test('incluye límites exactos en minWidth/maxWidth', () => {
    const layout = {
      width: '10%',
      breakpoints: [{ minWidth: 500, maxWidth: 800, layout: { width: '75%' } }],
    } as any

    const atMin = resolveResponsiveLayout(layout, { maxWidth: 500, maxHeight: 400 })
    const atMax = resolveResponsiveLayout(layout, { maxWidth: 800, maxHeight: 400 })
    const belowMin = resolveResponsiveLayout(layout, { maxWidth: 499, maxHeight: 400 })
    const aboveMax = resolveResponsiveLayout(layout, { maxWidth: 801, maxHeight: 400 })

    expect(atMin?.width).toBe(375)
    expect(atMax?.width).toBe(600)
    expect(belowMin?.width).toBe(49.9)
    expect(aboveMax?.width).toBe(80.1)
  })

  test('aplica breakpoints por alto usando minHeight y maxHeight', () => {
    const layout = {
      width: '40%',
      breakpoints: [
        { minHeight: 500, layout: { width: '80%' } },
        { maxHeight: 300, layout: { width: '25%' } },
      ],
    } as any

    const tall = resolveResponsiveLayout(layout, { maxWidth: 600, maxHeight: 500 })
    const short = resolveResponsiveLayout(layout, { maxWidth: 600, maxHeight: 300 })
    const middle = resolveResponsiveLayout(layout, { maxWidth: 600, maxHeight: 400 })

    expect(tall?.width).toBe(480)
    expect(short?.width).toBe(150)
    expect(middle?.width).toBe(240)
  })

  test('resuelve dimensiones decimales y rechaza unidades inválidas', () => {
    const constraints = { maxWidth: 500, maxHeight: 400, viewportWidth: 1200, viewportHeight: 900 }

    const decimals = resolveResponsiveLayout(
      {
        width: '33.3%',
        height: '12.5vh',
      } as any,
      constraints
    )

    const invalidPx = resolveResponsiveLayout({ width: '10.5' as any } as any, constraints)
    const invalidUnit = resolveResponsiveLayout({ width: '10em' as any } as any, constraints)
    const invalidSpaced = resolveResponsiveLayout({ width: '10 px' as any } as any, constraints)
    const invalidUppercase = resolveResponsiveLayout({ width: '10VW' as any } as any, constraints)

    expect(decimals?.width).toBe(166.5)
    expect(decimals?.height).toBe(112.5)
    expect(invalidPx?.width).toBeUndefined()
    expect(invalidUnit?.width).toBeUndefined()
    expect(invalidSpaced?.width).toBeUndefined()
    expect(invalidUppercase?.width).toBeUndefined()
  })
})

describe('reflow + responsive', () => {
  test('reflow usa width responsive del nodo root', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: { width: '50%' } as any,
      children: [{ type: 'text' as const, content: 'Hello responsive' }],
    }))

    const prepared = prepare(App, undefined)
    const layout = reflow(prepared, { maxWidth: 500, maxHeight: 300 }, { lineHeight: 20 })

    expect(layout.width[0]).toBe(250)
  })

  test('reflow aplica breakpoint para sobrescribir width', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        width: '50%',
        breakpoints: [{ maxWidth: 600, layout: { width: '100%' } }],
      } as any,
      children: [{ type: 'text' as const, content: 'Hello bp' }],
    }))

    const prepared = prepare(App, undefined)

    const narrow = reflow(prepared, { maxWidth: 500, maxHeight: 300 }, { lineHeight: 20 })
    const wide = reflow(prepared, { maxWidth: 800, maxHeight: 300 }, { lineHeight: 20 })

    expect(narrow.width[0]).toBe(500)
    expect(wide.width[0]).toBe(400)
  })

  test('reflow aplica breakpoint por altura en el límite exacto', () => {
    const App = defineComponent(() => ({
      type: 'element' as const,
      tag: 'div',
      layout: {
        width: '50%',
        breakpoints: [{ minHeight: 300, layout: { width: '100%' } }],
      } as any,
      children: [{ type: 'text' as const, content: 'Hello height breakpoint' }],
    }))

    const prepared = prepare(App, undefined)

    const atBoundary = reflow(prepared, { maxWidth: 500, maxHeight: 300 }, { lineHeight: 20 })
    const belowBoundary = reflow(prepared, { maxWidth: 500, maxHeight: 299 }, { lineHeight: 20 })

    expect(atBoundary.width[0]).toBe(500)
    expect(belowBoundary.width[0]).toBe(250)
  })
})
