# Feature: demo-ui-polish

> **Origen**: 5 defectos visuales reportados por el usuario sobre el demo de `demo/`:
> 1. `/ssr-stream` → la card no tiene padding interno, todo el contenido pegado a los bordes.
> 2. `/ssr?name=Dev&width=960&root=ssr-root` → lo mismo.
> 3. `/ssr?name=Dev&width=720&root=ssr-root` → lo mismo.
> 4. `/static.html` → sección «🔗 Context API — createContext + Stores» mal diseñada
>    (texto solapado, bloques que se salen de su caja, botones fuera del sidebar).
> 5. `/static.html` → sección «📝 Forms — bind() + validate()» con el mismo problema.

Alcance: solo el demo (`demo/`) y un test de guarda. **No se toca `src/`**: el
comportamiento del motor de layout es intencional (aritmética pura, cero lecturas DOM).

---

## Diagnóstico (medido con Playwright sobre `localhost:3000`)

### Causa A — Las páginas SSR pierden el padding de la card

`renderToString()`/`renderToReadableStream()` emiten en el atributo `style` de cada nodo:

```
position:absolute;left:0px;top:0px;transform:translate(..);width:..;height:..;
box-sizing:border-box;margin:0;padding:0;
```

(`src/ssr.ts`). Un `style` inline gana a cualquier regla de hoja **sin** `!important`,
así que las reglas del CSS inyectado nunca se aplican:

- `demo/ssr-page.tsx` → `.ssr-shell { padding:24px }` → computado `padding: 0px`.
- `demo/streaming-route.ts` → `.ssr-stream-shell { padding:24px; margin:0 auto }`
  → computado `padding: 0px; margin: 0px` (la card tampoco queda centrada).

Medición en el navegador: primer y último hijo de la card a **1px** del borde
(el 1px es el borde de la propia card), en las tres URLs reportadas.

### Causa B — Las secciones de sidebar montan árboles Axiom con CSS que pelea con el motor

El motor calcula posiciones/tamaños en memoria; el commit solo escribe
`position/transform/width/height` inline (no escribe `margin`/`padding`).

- **B1 — Grid de línea.** El motor usa un `lineHeight` global (20 por defecto).
  El CSS de esas secciones usa `line-height` 26px (`.hero-title` 20px/1.3) y
  20.8px (`.hero-body` 13px/1.6) → el texto sale de su caja (medido: 6px y 1px por
  línea) y pisa el bloque siguiente.
- **B2 — Padding/borde CSS sobre nodos del motor.** En el cliente el padding/borde
  CSS **sí** se aplica: desplaza a los hijos absolutos (el containing block es el
  padding box) y además consume la altura declarada (`height` es border-box).
  `.syntax-demo-item` (padding 6/10 + borde 1px) desbordaba **17-25px**.
- **B3 — Controles DOM.** `input` es hoja y no declara tamaño → el motor no puede
  medirlo. Además `attrs: { style: 'padding:6px 8px;margin-left:8px' }` **sobrescribe
  el atributo style completo** y borra la geometría del motor: el input (31px reales)
  desbordaba su fila de 20px y pisaba el status.
- **B4 — Filas de botones.** En un `row`, el motor asigna el ancho completo disponible
  a cada hijo que no declare `width` → los 3 botones de cada contador medían 241px
  cada uno y se posicionaban en x=0/245/490 (fuera del sidebar de 340px).
- **B5 — `<br>`** dentro de un árbol del motor no reserva espacio de forma
  predecible (se posiciona como bloque de 14px y desordena los offsets).
- **B6 — `attrs` no se diffean.** `src/render/diff.ts` compara `layout`, `text`,
  `on`, `style` y `classes` — nunca `attrs`. Medido: el `title` del status de
  Forms quedó congelado en el mensaje del primer render mientras el texto visible
  ya mostraba el error nuevo. Consecuencia: un `attrs` solo sirve para valores
  **estáticos**; un `title` reactivo es una mentira silenciosa.

> Hallazgo colateral (no corregido aquí, es `src/`): `provideStore(store, cb)`
> retorna `void`, así que la única forma de envolver el subárbol es capturar el
> nodo **dentro** del callback. El demo lo hacía al revés (renderizaba primero y
> luego llamaba al provider con `() => undefined`), y `injectStore` funcionaba
> igual por el fallback `ctx._defaultSignal` — el provider no envolvía nada.

---

## Reglas de diseño para árboles Axiom en el sidebar

1. `line-height` **≤ 20px** en todo texto del árbol (grid del motor).
2. Cero `padding`/`border` CSS que desplace hijos: el inset lo declara el motor con
   la prop `padding` del nodo. Un borde de 1px es aceptable (cuesta 1px abajo).
3. `height` explícito en toda fila de texto y en todo control DOM (`input`, botones).
   Solo se honra si el padre es flex (`stack`/`row`).
4. Nada de `attrs.style` dentro del árbol: borra la geometría del commit.
5. En un `row`, declarar `width` en cada hijo.
6. Nada de `<br>`: filas separadas con `gap`.
7. Texto de una línea y corto; `overflow:hidden; text-overflow:ellipsis` como red.
8. `attrs` solo con valores estáticos (el diff no los compara); lo reactivo va por
   props (`class`, `htmlFor`, `data`) o por texto.
9. Si un nodo del árbol debe recibir interacción de un `<label>`, usar el tag
   `label` + `htmlFor` (whitelisted) y no `attrs: { for: … }`.

---

## Cambios

### 1. `demo/ssr-page.tsx` — padding real de la card

En `SSR_SHELL_CSS`, la capa que ya neutraliza al motor (`position:static !important`,
`transform:none !important`) asume también el espaciado:

```css
.ssr-shell {
  padding:24px !important;
  margin:24px auto !important;
}
```

y se quita `margin:24px auto` del `style` de `attrs` en el JSX (una sola fuente de verdad).

El pill del título tiene el mismo problema: `.ssr-chip { padding:2px 8px;
  margin-left:8px }` estaba muerto, así que el pill quedaba pegado a
`renderToString()` → ambos valores pasan a `!important`.

### 2. `demo/streaming-route.ts` — padding real + centrado + separador

```css
.ssr-stream-shell {
  padding:24px !important;
  margin:0 auto !important;
}
.ssr-stream-shell hr { margin:16px 0 !important; }
```

Y lo mismo que en la página SSR para `.ssr-stream-chip { padding:2px 8px !important;
  margin-left:8px !important }`.

> Nota de alcance: los `margin-bottom` de `h1`/`p` del autor siguen inertes, pero
> el `gap:12px` del shell ya da un ritmo correcto y no se quiere más aire. El `hr`
> sí se activa porque marca la separación antes del enlace de vuelta.

### 3. `demo/context-demo.ts` + `demo/style.css` — rediseño de la sección

- Fuera del árbol: `h2.hero-title` y el párrafo largo (duplican el título y la
  descripción que ya están en el HTML estático de la sección).
- Cada bloque pasa a ser una card `demo-card` con `stack({ gap, padding })`:
  - micro-label (`.hero-badge`), valor (`.hero-body`), botón/acciones, y fila de código.
- Filas con `height` explícito (20 texto / 30 botones).
- Fila de botones con `width` explícito por hijo (`70 + 6 + 70 + 6 + 85 = 237 ≤ 245`).
- Bloque de código: micro-label `📎 Snippet` + dos `code` de una línea (sin `<br>`).
- `Provider` ahora envuelve de verdad: `provideStore(counterStore, () => {
  node = props.children() })` (B-hallazgo colateral). El comportamiento es
  idéntico (mismo store), pero el provider deja de ser decorativo.

### 4. `demo/forms-demo.ts` + `demo/style.css` — rediseño de la sección

- Fuera del árbol: badge/título/párrafo duplicados.
- Dos cards de campo: micro-label (`<label htmlFor>` real, para conservar el
  click-to-focus y el nombre accesible) + `input` (nodo del motor, `height:30`,
  sin `attrs.style`) + status de una línea (`height:20`, solo el primer error).
- Card «Live state» con dos `code` de una línea.
- Cada fila de label es un `<label htmlFor={inputId}>` real: se conserva el
  click-to-focus y el nombre accesible del input (el `for` va por prop, no por
  `attrs`).
- `statusLabel()` muestra **solo el primer error** (una línea). El mensaje
  completo **no** va a `title`: los `attrs` no se diffean (B6) y quedarían
  congelados en el primer render. El estado async sigue mostrándose como
  `checking…` y los colores (`--pending/--valid/--invalid`) comunican el estado.

CSS nuevo (al final de `demo/style.css`), con scope `.context-section` / `.forms-section`:

- `.demo-card` → fondo + borde 1px + radio (sin padding: lo pone el motor).
- `.hero-badge` / `.hero-body` de esas secciones → `line-height: 20px`.
- `.demo-code` → mono 11px, una línea con ellipsis.
- `.demo-input` → `font: inherit`, 12px, padding 5/8, radio, borde, foco visible.
- `.form-status--pending/--valid/--invalid` → colores (hoy no existían en el CSS).

### 5. `tests/demo-sections.test.ts` — guardas de regresión

El repo ya tiene tests de fuente sobre demos (`tests/portal-demo.test.ts`,
`tests/ssr.test.ts`). Se cubren las invariantes frágiles que causaron el bug y las
que se corrigieron después: cards SSR y pills con `!important`; árboles del sidebar
sin `attrs.style` ni `<br>`; labels con `htmlFor`; y `provideStore` ejecutando
`props.children()` dentro de su callback (orden por índice, como el test de portal).

---

## Verificación

1. `bun run typecheck`
2. `bun test` (suite completa)
3. `bun run demo:build` (rebuild del bundle del demo)
4. Chequeo en navegador (Playwright) — criterios de aceptación:
   - `/ssr-stream`: `padding` computado `24px`; card centrada; separación
     borde→primer hijo y último hijo→borde ≥ 20px.
   - `/ssr?name=Dev&width=960|720&root=ssr-root`: `padding` computado `24px`;
     separación ≥ 20px arriba y abajo.
   - `/static.html`: `#context-demo-root` y `#forms-demo-root` con **0** elementos
     cuyo `scrollHeight > clientHeight` y **0** solapamientos entre hermanos;
     ningún descendiente se sale del contenedor.
   - Los 3 botones de cada contador en una sola fila dentro del sidebar.

Resultados medidos (navegador, bundle y módulos SSR frescos):

| Criterio | Antes | Después |
| --- | --- | --- |
| `/ssr-stream` padding computado | `0px` | `24px` |
| `/ssr-stream` centrado | x=32 (pegado a la izquierda) | x=580 / 580 |
| `/ssr-stream` primer y último hijo | 1px del borde | 25px (24 padding + 1 borde) |
| `/ssr?width=960` padding computado | `0px` | `24px` |
| `/ssr?width=720` padding computado | `0px` | `24px` |
| `.ssr-chip` / `.ssr-stream-chip` | `padding:0; margin:0` | `2px 8px` / `margin-left:8px` |
| Context: elementos con `scrollHeight > clientHeight` | 5 (hasta 17px) | 0 |
| Context: botones fuera del sidebar | x=0/245/490, 241px de ancho | x=43/119/195, 70/70/85px |
| Forms: elementos con `scrollHeight > clientHeight` | 6 (hasta 17px) | 0 |
| Forms: solapamientos hermano-a-hermano | varios | 0 |
| Forms: input de 31px dentro de fila de 20px | sí | input 245×30 gestionado por el motor |
| Interacción (bind + validate, contadores, tema) | — | reactiva y sin desbordes |
| Accesibilidad del label de campo | `<label>` con el input dentro | `<label for>` + click enfoca el input |

Snippet de chequeo (ejecutado en la página):

```js
() => {
  const roots = ['context-demo-root', 'forms-demo-root'].map((id) => document.getElementById(id))
  const overflow = []
  const clip = []
  for (const root of roots) {
    const box = root.getBoundingClientRect()
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (el.scrollHeight - el.clientHeight > 1) overflow.push([root.id, el.tagName, el.className, el.scrollHeight - el.clientHeight])
      if (r.right > box.right + 1) clip.push([root.id, el.tagName, el.className, Math.round(r.right - box.right)])
    }
  }
  return { overflow, clip }
}
```

---

## Tareas

- [x] T1. Padding real en `/ssr` y `/ssr-stream` (`ssr-page.tsx`, `streaming-route.ts`)
- [x] T2. Rediseño de la sección Context (`context-demo.ts`, `style.css`)
- [x] T3. Rediseño de la sección Forms (`forms-demo.ts`, `style.css`)
- [x] T4. Test de guardas (`tests/demo-sections.test.ts`)
- [x] T5. Verificación: typecheck + suite + bundle + chequeo de navegador
- [x] T6. Correcciones de la verificación independiente: pill con `!important`,
      `title` obsoleto fuera, labels con `htmlFor`, `provideStore` envolviendo
      de verdad el subárbol