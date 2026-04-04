# Especificaciones Técnicas: Motor de Layout de Texto en Tiempo Real

**Basado en:** `@chenglou/pretext` — análisis profundo del código fuente  
**Propósito:** Documento de referencia para diseñar un framework de desarrollo web cuyo principio central es **eliminar el trabajo redundante del hot path de renderizado**, inspirado en la arquitectura de dos fases que `pretext` aplica al texto. El objetivo no es solo medir texto — es extender ese mismo patrón a todo el ciclo de actualización de la UI: separar el trabajo de análisis y preparación (costoso, hecho una vez) del trabajo de aplicación de cambios (barato, sin efectos secundarios, ejecutable en cualquier momento y con máxima frecuencia).

## El insight central que motiva el framework

`pretext` resolvió un problema de performance del DOM con un principio simple pero poderoso:

> **Separar el trabajo costoso (que solo depende de los datos) del trabajo barato (que solo depende del layout actual).**

`prepare(text, font)` hace todo lo que puede hacerse sin conocer el ancho disponible. `layout(prepared, maxWidth, lineHeight)` hace solo la aritmética que depende del ancho — sin DOM, sin canvas, sin strings. El resultado: un hot path de resize que cuesta 0.0002ms por bloque de texto en vez de 30ms+ por frame.

El framework que se busca diseñar aplica **el mismo principio al renderizado web completo**:

- **Fase de análisis** — dado un cambio en el estado de la aplicación, calcular de forma pura (sin tocar el DOM) exactamente qué nodos necesitan cambiar y cómo.
- **Fase de aplicación** — aplicar esos cambios de forma batched, secuencial y sin lecturas del DOM intercaladas con escrituras.

La diferencia con frameworks existentes (React, Vue, Svelte) es que estos todavía dependen del DOM o de un virtual DOM para calcular qué cambió. El framework propuesto toma el enfoque de `pretext`: el DOM es solo la pantalla de salida, nunca la fuente de verdad para los cálculos de layout.

---

## 1. Problema que resuelve

### 1.1 El problema específico de texto (origen de la solución)

El DOM tiene un problema fundamental: cada vez que se llama a `getBoundingClientRect()`, `offsetHeight`, o cualquier API de medición, el browser fuerza un **layout reflow sincrónico** — re-calcula todo el layout del documento. Si múltiples componentes hacen esto de forma independiente e intercalada con escrituras, el costo acumulado puede superar los **30ms por frame** para 500 bloques de texto.

`pretext` lo resuelve con una arquitectura de **dos fases separadas**:

1. **Fase de análisis y medición** (`prepare`) — se ejecuta UNA sola vez por texto. Usa `canvas.measureText()` para medir segmentos sin tocar el DOM layout. Costo: ~19ms para 500 textos en batch.
2. **Fase de layout** (`layout`) — se ejecuta en cada resize o cambio de ancho. Es aritmética pura sobre anchos cacheados. Costo: ~0.09ms para el mismo batch. **Cero accesos al DOM, cero llamadas a canvas, cero allocations.**

### 1.2 El problema general que motiva el framework

El mismo patrón de interleaving que destruye el performance en medición de texto existe en todo el ciclo de actualización de la UI moderna:

- Los frameworks basados en **virtual DOM** (React, Vue) recalculan un árbol completo, lo diffean contra el anterior, y luego parchean el DOM real — todo en secuencia, bloqueando el thread principal.
- Los frameworks basados en **reactividad granular** (Svelte, Solid) mejoran el problema pero aún dependen del DOM como árbol de referencia para saber dónde aplicar cambios.
- En ambos casos, el browser puede terminar haciendo **lecturas del DOM intercaladas con escrituras** durante el proceso de actualización, lo que fuerza reflows innecesarios.

**La apuesta del framework:** si podemos calcular TODOS los cambios necesarios en la UI de forma puramente aritmética (sin leer el DOM), y luego aplicarlos en un único batch de escrituras, el costo de actualizar la pantalla se reduce al mínimo físicamente posible — exactamente como `layout()` en `pretext`.

### 1.3 Por qué esta solución es posible ahora

`pretext` demostró que el browser ya tiene las primitivas necesarias:

- `canvas.measureText()` accede al font engine sin pasar por el DOM layout
- `Intl.Segmenter` permite segmentar texto unicode correctamente sin DOM
- `OffscreenCanvas` permite hacer trabajo de medición en un Web Worker

El framework extiende esa intuición: el browser expone suficientes APIs de bajo nivel como para hacer el trabajo de "qué va a cambiar y cuánto va a ocupar" completamente fuera del DOM, y solo escribir al DOM una vez que se tiene el plan completo.

---

## 2. Arquitectura del Sistema

```Text
┌─────────────────────────────────────────────────────────────┐
│                         PUBLIC API                           │
│  prepare() / prepareWithSegments()    layout() / layoutWithLines() │
└──────────────────┬──────────────────────────────────────────┘
                   │
     ┌─────────────▼─────────────┐
     │       analysis.ts          │
     │   Normalización, segmentación│
     │   Reglas de pegamento       │
     │   Intl.Segmenter (words)    │
     └─────────────┬─────────────┘
                   │
     ┌─────────────▼─────────────┐
     │      measurement.ts        │
     │  Canvas measureText()      │
     │  Cache por (font, segmento)│
     │  Corrección de emojis      │
     │  Engine profile (Safari/Chrome) │
     └─────────────┬─────────────┘
                   │
     ┌─────────────▼─────────────┐
     │       line-break.ts        │
     │  Walker de líneas greedy   │
     │  Hot path aritmético puro  │
     │  overflow-wrap support     │
     └─────────────┬─────────────┘
                   │
     ┌─────────────▼─────────────┐
     │         bidi.ts            │
     │  Metadata bidi (niveles)   │
     │  Solo para rich path        │
     └───────────────────────────┘
```

---

## 3. Módulo `analysis.ts` — Análisis de Texto

### 3.1 Tipos de segmento (`SegmentBreakKind`)

El modelo interno distingue **8 tipos de quiebre** de segmento:

| Kind | Descripción | Comportamiento |
| ------ | ------------- | ---------------- |
| `text` | Texto word-like normal | Unidad de medición y quiebre |
| `space` | Espacio colapsable (CSS `normal`) | Se cuelga al final de línea, no dispara quiebre |
| `preserved-space` | Espacio preservado (modo `pre-wrap`) | Visible, cuelga al final de línea |
| `tab` | Tabulación (`\t`) en modo `pre-wrap` | Avanza al próximo tab stop (8 espacios por defecto) |
| `glue` | Pegamento no-breaking (`\u00A0`, `\u202F`, `\u2060`, `\uFEFF`) | Previene quiebre en el punto, se fusiona con texto adyacente |
| `zero-width-break` | Oportunidad de quiebre sin ancho (`\u200B`) | Punto de quiebre con ancho 0 |
| `soft-hyphen` | Guión suave (`\u00AD`) | Invisible en no-quiebre; expone `-` visible si se quiebra ahí |
| `hard-break` | Salto de línea (`\n`) en modo `pre-wrap` | Termina la línea explícitamente |

> **REGLA CRÍTICA:** No colapsar estos tipos a un boolean. El modelo se construyó así deliberadamente.

### 3.2 Pipeline de análisis (en orden de ejecución)

```Text
texto crudo
    │
    ▼
1. normalizeWhitespace()
    │  'normal': colapsa runs de whitespace a 1 espacio, quita leading/trailing
    │  'pre-wrap': solo normaliza \r, \r\n → \n
    ▼
2. Intl.Segmenter (granularity: 'word')
    │  Segmentación unicode nativa del browser
    ▼
3. splitSegmentByBreakKind()
    │  Clasifica cada caracter en uno de los 8 kinds
    ▼
4. buildMergedSegmentation() — fusiones semánticas
    ├── Fusión de punctuation left-sticky (e.g. "hello." como una unidad)
    ├── Fusión CJK + kinsoku (prohibidos al inicio/final de línea en japonés/chino)
    ├── Reglas Myanmar medial glue
    ├── Reglas Arabic no-space punctuation clusters
    └── Fusión forward-sticky clusters (quotes de apertura con siguiente palabra)
    ▼
5. mergeUrlLikeRuns()
    │  URLs como unidades de quiebre estructuradas (path hasta '?' como un bloque)
    ▼
6. mergeUrlQueryRuns()
    │  Query string como segunda unidad breakable separada
    ▼
7. mergeNumericRuns()
    │  Expresiones numéricas (e.g. "२४×७", "7:00-9:00") como una unidad
    ▼
8. splitHyphenatedNumericRuns()
    │  Ranges numéricos con guión se vuelven breakables
    ▼
9. mergeAsciiPunctuationChains()
    │  Clusters de puntuación ASCII encadenados
    ▼
10. carryTrailingForwardStickyAcrossCJKBoundary()
     │  Mueve trailing forward-sticky al inicio del siguiente CJK grapheme
     ▼
11. compileAnalysisChunks()
     Divide en chunks por hard-breaks (solo en pre-wrap)
```

### 3.3 Sets de reglas tipográficas

```typescript
// Inicio de línea prohibido (kinsoku) — no puede aparecer al inicio de línea en CJK
const kinsokuStart = new Set([
  '\uFF0C', // ，  Coma fullwidth
  '\uFF0E', // ．  Punto fullwidth
  '\uFF01', // ！  Signo de exclamación fullwidth
  '\uFF1A', // ：  Dos puntos fullwidth
  '\uFF1B', // ；  Punto y coma fullwidth
  '\uFF1F', // ？  Signo de pregunta fullwidth
  '\u3001', // 、 Coma ideográfica
  '\u3002', // 。 Punto ideográfico
  '\u30FB', // ・ Punto katakana
  '\uFF09', // ）  Paréntesis derecho fullwidth
  '\u3005', // 々 Marca de iteración ideográfica
  '\u303B', // 〻 Marca de iteración CJK  
  '\u309D', '\u309E', '\u30FD', '\u30FE', // Marcas de iteración kana
  '\u30FC', // ー Vocal larga katakana
  // ...y más brackets de cierre CJK
])

// Final de línea prohibido — no puede aparecer al final de línea en CJK
const kinsokuEnd = new Set(['"', '(', '[', '{', '"', ''', '«', '‹', ...])

// Punctuation left-sticky (se fusiona con la palabra que precede)
const leftStickyPunctuation = new Set(['.', ',', '!', '?', ':', ';', ...])
```

### 3.4 Detección de CJK

```typescript
function isCJK(s: string): boolean {
  // Cubre todos los bloques Unicode CJK incluyendo extensiones astral
  // U+4E00-U+9FFF  — CJK Unified Ideographs
  // U+3400-U+4DBF  — CJK Extension A
  // U+20000-U+2EBEF — Extensiones B, C, D, E, F (astral — requiere codePointAt, NO charCodeAt)
  // U+30000-U+3134F — Extension G
  // U+F900-U+FAFF  — CJK Compatibility Ideographs
  // U+3000-U+303F  — CJK Symbols and Punctuation
  // U+3040-U+309F  — Hiragana
  // U+30A0-U+30FF  — Katakana
  // U+AC00-U+D7AF  — Hangul Syllables
  // U+FF00-U+FFEF  — Halfwidth and Fullwidth Forms
}
```

> **GOTCHA:** Los caracteres CJK del plano astral (U+20000+) DEBEN usar `codePointAt()`, NO `charCodeAt()`. `charCodeAt()` solo cubre BMP.

---

## 4. Módulo `measurement.ts` — Medición con Canvas

### 4.1 Contexto de Canvas

```typescript
// Preferencia: OffscreenCanvas (worker-safe, sin DOM)
// Fallback: document.createElement('canvas')
// Error si ninguno está disponible (server-side sin polyfill)

function getMeasureContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
```

### 4.2 Estructura del cache

```typescript
segmentMetricCaches: Map<string (font), Map<string (segmento), SegmentMetrics>>

SegmentMetrics {
  width: number              // Ancho medido por canvas
  containsCJK: boolean       // Si contiene caracteres CJK (para splitting)
  emojiCount?: number        // Lazy — cantidad de emoji graphemes
  graphemeWidths?: number[]  // Lazy — anchos por grapheme (para overflow-wrap)
  graphemePrefixWidths?: number[] // Lazy — anchos acumulados de prefijo (para Safari)
}
```

El cache es `Map<font, Map<segment, metrics>>`. Es compartido entre todos los textos y reseteable via `clearCache()`. Los facts más costosos se computan **lazy** para no pagar por lo que no se usa.

### 4.3 Corrección de Emoji

**Problema:** Chrome y Firefox en macOS miden emoji MÁS ANCHO en canvas que en DOM a tamaños < 24px. Safari no tiene esta discrepancia (pero mide más ancho que `fontSize` en ambos lados).

**Solución:**

```typescript
function getEmojiCorrection(font: string, fontSize: number): number {
  // 1. Mide '\u{1F600}' con canvas
  const canvasW = ctx.measureText('\u{1F600}').width
  
  // 2. Si canvas > fontSize + 0.5 (indica posible inflación)
  //    → crea un <span> invisible, lo mide con getBoundingClientRect
  //    → calcula correction = canvasW - domW
  
  // 3. Cachea el resultado por font
  // Esta es la ÚNICA lectura del DOM que se permite, y se hace solo UNA vez por font
}
```

La corrección es constante por tamaño de emoji grapheme y es efectivamente independiente de la familia de fuente.

### 4.4 Engine Profile (diferencias entre browsers)

```typescript
type EngineProfile = {
  lineFitEpsilon: number                 // Tolerancia de ajuste de línea
  carryCJKAfterClosingQuote: boolean     // Chrome-specific CJK behavior
  preferPrefixWidthsForBreakableRuns: boolean // Safari prefix widths
  preferEarlySoftHyphenBreak: boolean    // Safari soft-hyphen timing
}

// Valores por browser:
// Chrome/Chromium:  lineFitEpsilon = 0.005, carryCJKAfterClosingQuote = true
// Safari:           lineFitEpsilon = 1/64,  preferPrefixWidthsForBreakableRuns = true
// Firefox/Server:   lineFitEpsilon = 0.005  (sin quirks adicionales)
```

> **GOTCHA crítico:** `system-ui` es **insegura** para medición. Canvas y DOM resuelven a variantes ópticas distintas en macOS (SF Pro Text vs SF Pro Display) a ciertos tamaños. Usar siempre fuentes con nombre (e.g., `Inter`, `Helvetica`).

### 4.5 Medición de graphemes por segmento

Para segmentos marcados como breakable (`word-like` y `length > 1`), se pre-calculan los anchos individuales de cada grapheme para soportar `overflow-wrap: break-word`:

```typescript
// Anchos individuales: [w₀, w₁, w₂, ...]
getSegmentGraphemeWidths(seg, metrics, cache, emojiCorrection)

// Anchos de prefijo acumulados: [w₀, w₀+w₁, w₀+w₁+w₂, ...]
// Usado en Safari para mayor precisión
getSegmentGraphemePrefixWidths(seg, metrics, cache, emojiCorrection)
```

---

## 5. Módulo `layout.ts` — La API Pública

### 5.1 Estructura interna del prepared handle

```typescript
type PreparedCore = {
  widths: number[]                    // Ancho de cada segmento
  lineEndFitAdvances: number[]        // Contribución al ancho cuando la línea termina AQUÍ (fit check)
  lineEndPaintAdvances: number[]      // Contribución pintada al final de línea (puede incluir trailing space)
  kinds: SegmentBreakKind[]           // Tipo de quiebre por segmento
  simpleLineWalkFastPath: boolean     // true si solo hay 'text' y 'space' → usa walker simplificado
  segLevels: Int8Array | null         // Niveles bidi (solo en rich path)
  breakableWidths: (number[] | null)[]   // Anchos de grapheme para overflow-wrap
  breakablePrefixWidths: (number[] | null)[] // Anchos de prefijo para Safari
  discretionaryHyphenWidth: number    // Ancho del '-' visible para soft hyphens
  tabStopAdvance: number              // Distancia entre tab stops (8 * spaceWidth)
  chunks: PreparedLineChunk[]         // Chunks separados por hard-breaks
}
```

El tipo `PreparedText` es **opaco** por diseño — usa un brand type (`declare const preparedTextBrand: unique symbol`) para que TypeScript impida que el código del usuario acceda a internos.

### 5.2 Pipeline de `prepare()`

```Text
prepare(text, font, options?)
    │
    ▼
analyzeText()  ← analysis.ts
    │  Retorna: TextAnalysis con segmentos clasificados
    ▼
measureAnalysis()
    │
    ├── getFontMeasurementState(font)
    │     ├── ctx.font = font
    │     ├── getSegmentMetricCache(font)
    │     └── getEmojiCorrection(font, fontSize)
    │
    ├── Para cada segmento en analysis:
    │     ├── 'soft-hyphen' → width=0, lineEndFitAdvance=hyphenWidth
    │     ├── 'hard-break'  → width=0
    │     ├── 'tab'         → width=0 (se calcula en runtime en line-break)
    │     ├── CJK text      → split por grapheme con kinsoku merge, medir cada grapheme
    │     └── otros         → measureText(segment), calcular lineEndAdvances
    │
    └── Retorna PreparedText (opaque handle)
```

### 5.3 `layout()` — El Hot Path

```typescript
export function layout(prepared: PreparedText, maxWidth: number, lineHeight: number): LayoutResult {
  const lineCount = countPreparedLines(getInternalPrepared(prepared), maxWidth)
  return { lineCount, height: lineCount * lineHeight }
}
```

**Garantías del hot path:**

- Cero accesos al DOM
- Cero llamadas a canvas
- Cero operaciones sobre strings
- Mínimas allocations (retorna un objeto literal pequeño)
- Aritmética pura sobre arrays pre-calculados

### 5.4 Tipos de retorno de la API rich

```typescript
type LayoutLine = {
  text: string        // Texto completo de la línea (materializado)
  width: number       // Ancho medido
  start: LayoutCursor // Cursor de inicio (inclusive)
  end: LayoutCursor   // Cursor de fin (exclusive)
}

type LayoutLineRange = {
  width: number       // Sin materializar el texto
  start: LayoutCursor
  end: LayoutCursor
}

type LayoutCursor = {
  segmentIndex: number    // Índice en el array de segmentos
  graphemeIndex: number   // Índice dentro del segmento (0 en boundaries)
}
```

---

## 6. Módulo `line-break.ts` — El Walker de Líneas

### 6.1 Dos walkers (fast path vs rich path)

**Fast path** (`simpleLineWalkFastPath = true`): Solo texto y espacios colapsables. No hay tabs, glue, soft-hyphens, ni hard-breaks. Usa `countPreparedLinesSimple()` que es más simple y rápido.

**Rich path** (`simpleLineWalkFastPath = false`): Soporta todos los 8 tipos de segmento. Más complejo pero necesario para pre-wrap, URLs, bidi, soft hyphens.

### 6.2 Algoritmo de greedy line breaking

```Text
Para cada segmento i en el chunk:
  
  lineW = ancho acumulado en línea actual
  
  CASO: soft-hyphen
    → registra un pendingBreak con hyphenWidth en posición i+1
    
  CASO: primer segmento en línea (!hasContent)
    → si el segmento excede maxWidth y es breakable → appendBreakableSegment
    → si no → startLineAtSegment
    
  CASO: cabe en línea actual (lineW + w <= maxWidth + epsilon)
    → appendWholeSegment
    → updatePendingBreak si el segmento es break-opportunity
    
  CASO: no cabe (lineW + w > maxWidth + epsilon)
    1. ¿Hay pendingBreak de soft-hyphen y preferEarlySoftHyphenBreak? → emitLine en pendingBreak
    2. ¿Hay soft-hyphen y el segmento es breakable? → continueSoftHyphenBreakableSegment
    3. ¿El segmento actual es un break-opportunity y cabe con su lineEndFitAdvance? → emitLine incluyendo el segmento
    4. ¿Hay pendingBreak y su fitWidth <= maxWidth? → emitLine en pendingBreak
    5. ¿El segmento excede maxWidth y tiene graphemeWidths? → emitLine y appendBreakableSegment
    6. → emitLine (fuerza quiebre de emergencia)
```

### 6.3 Trailing whitespace

Los espacios se "cuelgan" al final de la línea — no disparan un quiebre, pero tampoco cuentan hacia el `lineEndFitAdvance`. Esto replica el comportamiento CSS donde los espacios trailing no contribuyen a la línea para efectos de layout.

### 6.4 Tab stops

```typescript
function getTabAdvance(lineWidth: number, tabStopAdvance: number): number {
  const remainder = lineWidth % tabStopAdvance
  if (Math.abs(remainder) <= 1e-6) return tabStopAdvance  // Ya en tab stop → avanzar al siguiente
  return tabStopAdvance - remainder                        // Avanzar al próximo tab stop
}
// tabStopAdvance = spaceWidth * 8 (comportamiento default del browser)
```

### 6.5 Overflow-wrap: break-word

Para segmentos cuyo ancho individual excede `maxWidth`, se usan los `breakableWidths` (anchos por grapheme) para quiebre de emergencia a nivel de grapheme.

```Text
Para cada grapheme g en el segmento breakable:
  si lineW + gw > maxWidth + epsilon:
    emitLine()
    startLineAtGrapheme(segmentIndex, g, gw)
  sino:
    lineW += gw
```

---

## 7. Módulo `bidi.ts` — Soporte Bidireccional

### 7.1 Propósito

El módulo provee metadata bidi (niveles de embedding Unicode) para el rich path (`prepareWithSegments()`). El engine de line-breaking **NO consume estos niveles** — solo están disponibles como metadata para renderers customizados (canvas, SVG, WebGL).

### 7.2 Algoritmo

Implementación simplificada del algoritmo Unicode Bidirectional (UBA) basada en pdf.js:

```Text
1. Clasificar cada caracter en tipo bidi (L, R, AL, AN, EN, etc.)
2. Si numBidi/len < 0.3 → startLevel = 1 (texto predominantemente RTL)
   Si no → startLevel = 0 (texto predominantemente LTR)
3. Aplicar reglas W1-W7 (neutrales y números)
4. Aplicar reglas N1-N2 (neutrals entre R y R / L y L)
5. Aplicar reglas I1-I2 (implicit levels)
6. Mapear niveles a segmentos via segStarts[]
```

Los niveles se exponen como `Int8Array | null` en `PreparedTextWithSegments.segLevels`.

---

## 8. Modos de WhiteSpace

### 8.1 `normal` (default)

```Text
CSS equivalente:
  white-space: normal
  word-break: normal
  overflow-wrap: break-word
  line-break: auto

Comportamiento:
- Colapsa whitespace múltiple a un espacio
- Ignora \n en el input (no genera hard breaks)
- Espacios al inicio/final del párrafo se eliminan
- Espacios trailing se cuelgan al borde de la línea
- Palabras muy largas se quiebran por grapheme
```

### 8.2 `pre-wrap`

```Text
CSS equivalente:
  white-space: pre-wrap
  word-break: normal
  overflow-wrap: break-word

Comportamiento:
- Preserva espacios ordinarios (se convierten en 'preserved-space')
- Preserva \n como 'hard-break' (termina la línea explícitamente)
- \t avanza al próximo tab stop default (tabSize: 8 espacios)
- Los espacios trailing en pre-wrap TAMBIÉN se cuelgan al borde
- Líneas vacías por \n\n se preservan (generan chunks con startIndex === endIndex)
- Un \n final NO genera una línea extra vacía
```

---

## 9. Especificación de la API Pública

### 9.1 API de medición simple (use case 1)

```typescript
// Análisis + medición una sola vez
function prepare(
  text: string,
  font: string,    // Mismo formato que canvas.font: "16px Inter", "bold 14px Helvetica"
  options?: {
    whiteSpace?: 'normal' | 'pre-wrap'
  }
): PreparedText

// Hot path de resize — aritmética pura
function layout(
  prepared: PreparedText,
  maxWidth: number,    // Ancho máximo disponible en px
  lineHeight: number   // lineHeight en px (sincronizado con CSS line-height)
): {
  height: number       // lineCount * lineHeight
  lineCount: number
}
```

### 9.2 API de layout enriquecido (use case 2)

```typescript
// Variante rica que expone segmentos para renderizado manual
function prepareWithSegments(text, font, options?): PreparedTextWithSegments

// Layout fijo con materialización de líneas
function layoutWithLines(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  lineHeight: number
): {
  height: number
  lineCount: number
  lines: LayoutLine[]    // Array materializado de líneas con texto y cursores
}

// Walker no-materializador — solo geometría, sin strings
// Ideal para shrinkwrap y búsqueda binaria de ancho
function walkLineRanges(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  onLine: (line: LayoutLineRange) => void
): number  // retorna lineCount

// Iterator para layout con ancho variable por línea
// (e.g., texto que fluye alrededor de una imagen)
function layoutNextLine(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number
): LayoutLine | null   // null cuando el párrafo se agota
```

### 9.3 Utilidades

```typescript
// Limpia todos los caches internos (útil si la app cicla por muchas fuentes)
function clearCache(): void

// Cambia el locale para Intl.Segmenter (para textos en idiomas específicos)
// También llama clearCache() internamente
function setLocale(locale?: string): void
```

---

## 10. Invariantes de Performance

| Operación | Costo | Restricciones |
| ----------- | ------- | --------------- |
| `prepare()` 500 textos | ~19ms | Una vez por texto |
| `layout()` 500 textos | ~0.09ms | Sin DOM, sin canvas, sin strings |
| `getSegmentMetrics()` cached | O(1) | Map lookup |
| `getEmojiCorrection()` | Una DOM read por font | Se cachea después |
| CJK grapheme split | O(n graphemes) | Solo en prepare, no en layout |
| Soft-hyphen break | O(graphemes) | Solo cuando aplica |

**Garantía del hot path `layout()`:**

- No DOM reads
- No canvas calls  
- No string operations
- No gratuitous allocations
- Solo aritmética sobre parallel arrays pre-calculados

---

## 11. Patrones de Uso para un Framework Web

### 11.1 Patrón en React — componente con altura dinámica

```tsx
function TextBlock({ text, font, maxWidth, lineHeight }) {
  const prepared = useMemo(
    () => prepare(text, font),
    [text, font]  // Solo re-prepare si el texto o fuente cambian
  )
  
  const { height } = useMemo(
    () => layout(prepared, maxWidth, lineHeight),
    [prepared, maxWidth, lineHeight]  // Re-layout en resize
  )
  
  return <div style={{ height, font }}>{text}</div>
}
```

### 11.2 Patrón para virtualización de listas

```typescript
// Calcular todas las alturas sin tocar el DOM
const preparedItems = items.map(item => prepare(item.text, item.font))

// En cada resize:
function getItemHeight(index: number, containerWidth: number): number {
  const { height } = layout(preparedItems[index], containerWidth, LINE_HEIGHT)
  return height
}
```

### 11.3 Patrón para masonry layout

```typescript
const columns: number[] = new Array(columnCount).fill(0)  // Y acumulado por columna

for (const item of items) {
  const prepared = prepare(item.text, item.font)
  
  // Encontrar la columna más baja
  const shortestColumnIndex = columns.indexOf(Math.min(...columns))
  const columnWidth = containerWidth / columnCount
  
  const { height } = layout(prepared, columnWidth, LINE_HEIGHT)
  
  placeItem(item, shortestColumnIndex, columns[shortestColumnIndex])
  columns[shortestColumnIndex] += height + GAP
}
```

### 11.4 Patrón shrinkwrap — encontrar el ancho mínimo que ajusta el texto en N líneas

```typescript
function findMinWidth(text: string, font: string, targetLines: number): number {
  const prepared = prepareWithSegments(text, font)
  
  let lo = 0, hi = 1000
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2
    let lineCount = 0
    walkLineRanges(prepared, mid, () => { lineCount++ })
    
    if (lineCount <= targetLines) hi = mid
    else lo = mid
  }
  
  return hi
}
```

### 11.5 Patrón flujo de texto alrededor de imagen

```typescript
const prepared = prepareWithSegments(text, font)
let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
let y = 0

while (true) {
  // Las líneas junto a la imagen son más angostas
  const availableWidth = y < image.bottom
    ? containerWidth - imageWidth
    : containerWidth
  
  const line = layoutNextLine(prepared, cursor, availableWidth)
  if (line === null) break
  
  renderLine(line.text, imageWidth, y)
  cursor = line.end
  y += lineHeight
}
```

---

## 12. Soporte Internacional

### 12.1 Cobertura garantizada

| Script | Estado | Notas |
| -------- | -------- | ------- |
| Latín/ASCII | ✅ Exacto | Incluye URLs, números, puntuación |
| CJK (Chino, Japonés, Coreano) | ✅ Exacto en Safari; ~99% en Chrome | Queda un campo de kinsoku en Chrome |
| Árabe | ✅ Coarse corpus limpio | Tolerancia ε para fine-width edge cases |
| Hebreo | ✅ Exacto | Via bidi |
| Thai | ✅ Exacto | Dependencia de Intl.Segmenter del browser |
| Khmer | ✅ Exacto | Requiere zero-width separators en texto fuente |
| Vietnamita | ✅ | Via Latin + diacríticos |
| Hindi/Devanagari | ✅ | Via canvas + Intl.Segmenter |
| Myanmar | ⚠️ Parcial | Hay campos de discrepancia Chrome vs Safari |
| Urdu (Nastaliq) | ⚠️ Parked | Requeriría font shaping más profundo |
| Emoji | ✅ Con corrección | Corrección automática de inflación canvas |
| Mixto bidi (RTL+LTR) | ✅ Para line-breaking | Metadata bidi para renderizado custom |

### 12.2 Locale

```typescript
// Default: usa el locale del runtime (navigator.language)
// Afecta a Intl.Segmenter word — algunos idiomas se segmentan diferente

setLocale('ja')   // Japonés
setLocale('zh')   // Chino
setLocale('ar')   // Árabe
setLocale()       // Reset al default del runtime
```

---

## 13. Configuración CSS objetivo

El engine está calibrado para este subconjunto de CSS que cubre la mayoría de texto en apps web:

```css
white-space: normal;        /* o pre-wrap con la opción correspondiente */
word-break: normal;
overflow-wrap: break-word;  /* quiebre en grapheme cuando una palabra no cabe */
line-break: auto;
```

**Explícitamente fuera de scope (por ahora):**

- `word-break: break-all`
- `word-break: keep-all`
- `line-break: strict` / `loose`
- `overflow-wrap: anywhere`
- `text-justify`
- Full font shaping (kerning por pares, ligaduras complejas) — canvas lo aproxima bien

---

## 14. Integración en un Framework

### 14.1 Para React

El package se publica como **ESM puro** (`"type": "module"`). Compatible con React via import directo:

```typescript
import { prepare, layout } from '@chenglou/pretext'
```

Para SSR (Next.js, Astro en modo SSR): `getMeasureContext()` requiere `OffscreenCanvas` o `document`. En server-side:

- No está disponible canvas nativo
- Opción 1: Polyfill con `node-canvas` (`npm install canvas`)
- Opción 2: Pasar alturas estimadas en SSR y recalcular en hydration (layout shift aceptado)
- Opción 3: Usar `prepare()` solo en client (no en SSR)

### 14.2 Para Astro

En componentes Astro con `client:load` o `client:visible`:

```astro
---
// Solo en el servidor: height estimado o skeleton
const estimatedHeight = '100px'
---
<TextComponent 
  text={text} 
  font="16px Inter"
  client:visible
/>
```

### 14.3 Para Workers

`OffscreenCanvas` está disponible en Web Workers. El engine puede correr completamente en un worker:

```typescript
// worker.ts
import { prepare, layout } from '@chenglou/pretext'

self.onmessage = ({ data: { texts, font, maxWidth, lineHeight } }) => {
  const results = texts.map(text => {
    const prepared = prepare(text, font)
    return layout(prepared, maxWidth, lineHeight)
  })
  self.postMessage(results)
}
```

---

## 15. Convenciones de Formato de Fuente

El parámetro `font` usa el **mismo formato que `canvas.context.font`** — que es el mismo que el shorthand CSS `font`:

```Text
"<weight>? <style>? <size><unit> <family>"

Ejemplos válidos:
  "16px Inter"
  "bold 14px Helvetica Neue"
  "italic 18px Georgia, serif"
  "400 16px -apple-system, BlinkMacSystemFont, 'Segoe UI'"

INVALIDO (no usar):
  "system-ui"  ← Canvas y DOM pueden resolver diferente en macOS
```

**Sincronización con CSS:** El `font` pasado a `prepare()` y el `lineHeight` pasado a `layout()` DEBEN estar sincronizados con los valores CSS del elemento que renderiza el texto. Si no coinciden, las mediciones serán incorrectas.

---

## 16. Consideraciones para el Framework

### 16.1 Cache lifecycle

- Los caches son globales y compartidos entre textos.
- Llamar `clearCache()` cuando el usuario cambia de tema (y por tanto de font).
- Los `PreparedText` handles son lightweight — no retienen el string original.
- `sharedLineTextCaches` usa `WeakMap<PreparedText, ...>` — se limpia automáticamente cuando el handle no tiene más referencias.

### 16.2 Separación estricta de fases

- `prepare()` / `prepareWithSegments()` hacen trabajo **solo horizontal** (anchos de segmentos). El `lineHeight` se pasa después, en `layout()`.
- Esto significa que el mismo `PreparedText` se puede usar con diferentes `lineHeight` sin re-preparar.

### 16.3 Invariante de no-mutación

- `layout()` no muta el `PreparedText`.
- Los handles son seguros para reusar concurrentemente (aunque el engine no es thread-safe en el sentido de SharedArrayBuffer).

### 16.4 Chunks de hard-break

En modo `pre-wrap`, el texto se divide en `chunks` — uno por cada párrafo separado por `\n`. El walker de líneas itera chunk por chunk. Un chunk con `startIndex === endIndex` representa una línea vacía (por `\n\n`).

---

## 17. Decisiones de Diseño (Anti-patterns conocidos)

### ❌ Lo que NO funcionó y fue descartado

1. **Medición de strings completos de líneas candidatas en `layout()`** — más lento y reintroduce canvas en el hot path.
2. **Elementos DOM ocultos para medición** — reinicia reflows.
3. **SVG `getComputedTextLength()`** — más lento que canvas.
4. **Corrección por pares de segmentos (pair correction models)** — demasiado local, no movió los misses reales en árabe.
5. **HarfBuzz headless como backend alternativo** — útil para research, no es una alternativa en runtime.
6. **Lookup tables / naive scaling para system-ui** — no confiable.
7. **Mover lógica de break policy a `layout()`** — regresó el benchmark. Las fixes van en `prepare()` via preprocessing.

### ✅ Lo que SÍ funcionó

1. **Preprocessing semántico en `prepare()`** — fusión de punctuation, URL modeling, kinsoku — compró más precisión que cualquier corrección en runtime.
2. **Tolerancia `lineFitEpsilon` browser-específica** — pequeño shim justificado por el campo de fine-width en árabe.
3. **Canvas `measureText()` + cache de segmentos** — core del enfoque, es consistente internamente aunque no perfectamente aditivo.
4. **Detección de corrección emoji en runtime** — auto-detectado, sin lookup tables.
5. **Fast path separado para texto simple** — gran diferencia de performance para el 90% de casos.

---

## 18. Benchmarks de Referencia

***(Medidos en Chrome, en un batch de 500 textos con el corpus de test)***

| Operación | Tiempo |
| ----------- | -------- |
| `prepare()` 500 textos | ~19ms total |
| `layout()` 500 textos | ~0.09ms total |
| `layout()` por texto | ~0.0002ms |

El ratio prepare/layout es ~211x. El diseño asume que `layout()` se llama muchas veces (en cada resize, en cada frame de animación) mientras `prepare()` se llama una sola vez por texto.

---

## 19. Estructura de Archivos del Engine

```Text
src/
  layout.ts       — API pública + measureAnalysis() + builders de líneas materializadas
  analysis.ts     — Normalización, segmentación Intl.Segmenter, reglas de fusión
  measurement.ts  — Canvas measureText, cache de métricas, corrección emoji, engine profile
  line-break.ts   — Walkers de líneas (simple y rich path), countPreparedLines
  bidi.ts         — Metadata bidi Unicode simplificada (solo rich path)
```

**Dependencias:**

```Text
layout.ts → analysis.ts + measurement.ts + line-break.ts + bidi.ts
line-break.ts → analysis.ts (types) + measurement.ts (getEngineProfile)
measurement.ts → analysis.ts (isCJK)
bidi.ts → (independiente)
```

---

## 20. Glossary

| Término | Definición |
| --------- | ------------ |
| **Segment** | Unidad mínima de texto con un `SegmentBreakKind` único. Ej: "hello", " ", "world" |
| **Grapheme** | Unidad perceptible más pequeña del texto. Ej: "á" = 'a' + combining accent = 1 grapheme |
| **Prepared handle** | Resultado opaco de `prepare()` — contiene anchos y metadata, no el texto original |
| **Chunk** | Sección del prepared handle entre hard-breaks (solo relevante en `pre-wrap`) |
| **lineFitEpsilon** | Tolerancia numérica para decidir si un segmento "cabe" en una línea (browser-specific) |
| **lineEndFitAdvance** | Ancho que "cuenta" al determinar si el SIGUIENTE segmento cabe (excluye trailing space) |
| **lineEndPaintAdvance** | Ancho que se "pinta" al final de línea (puede incluir trailing space en preserved mode) |
| **kinsoku** | Reglas tipográficas japonesas/CJK sobre qué caracteres pueden/no iniciar o terminar línea |
| **glue** | Caracter no-breaking que se fusiona con el texto adyacente (NBSP, etc.) |
| **discretionaryHyphen** | Guión visible `-` que aparece cuando se rompe en un soft-hyphen (`\u00AD`) |
| **fast path** | Walker simplificado cuando el texto solo contiene `text` y `space` (mayoría de casos) |
| **rich path** | Walker completo para pre-wrap, URLs, bidi, soft-hyphens, hard-breaks |

---

## 21. Principios Arquitectónicos Generalizables para el Framework

Esta sección extrae las meta-lecciones de `pretext` que aplican al diseño de un framework web completo — no solo a medición de texto. El objetivo es identificar los patrones que hacen que `layout()` cueste 0.0002ms y aplicarlos a todo el ciclo de actualización de la UI.

### 21.1 El principio central: Separación de fases por tipo de dependencia

```Text
┌─────────────────────────────────────────────────────────────────────────┐
│  FASE DE PREPARACIÓN                                                    │
│  ─────────────────                                                      │
│  Entrada: datos de la aplicación + configuración estática               │
│  Salida: "prepared handle" — estructura opaca optimizada                │
│                                                                         │
│  ✅ Puede hacer:                                                        │
│     - Trabajo costoso (análisis, normalización, cálculos complejos)     │
│     - Lecturas del DOM (solo calibración, una vez por config)           │
│     - Allocations, construcción de caches                               │
│     - String operations, regex, parsing                                 │
│                                                                         │
│  ❌ NO debe depender de:                                                │
│     - Layout actual del browser (dimensiones, posiciones)               │
│     - Estado que cambia en cada frame                                   │
│     - Interacciones del usuario en curso                                │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  FASE DE APLICACIÓN (hot path)                                          │
│  ───────────────────────────                                            │
│  Entrada: prepared handle + constraints del momento (width, scroll, etc)│
│  Salida: resultado mínimo (counts, heights, o lista de cambios DOM)     │
│                                                                         │
│  ✅ Puede hacer:                                                        │
│     - Aritmética sobre arrays pre-calculados                            │
│     - Comparaciones, lookups en Map/Set                                 │
│     - Retornar objetos literales pequeños                               │
│                                                                         │
│  ❌ PROHIBIDO en el hot path:                                           │
│     - Lecturas del DOM                                                  │
│     - Llamadas a canvas u otras APIs de medición                        │
│     - Operaciones sobre strings (concatenación, split, regex)           │
│     - Allocations innecesarias (arrays nuevos, objetos temporales)      │
│     - Cualquier cosa que fuerce layout reflow                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Pregunta de diseño clave para cada operación:** ¿Este trabajo depende SOLO de los datos de la app, o también del layout actual del browser?

- Si depende **solo de datos** → va en `prepare()`
- Si depende del **layout actual** → va en `apply()` y DEBE ser aritmética pura

### 21.2 Lecciones de pretext aplicables al framework

| Lección de pretext | Aplicación al framework |
| ------------------- | ------------------------- |
| `prepare()` hace todo el trabajo que puede hacerse sin conocer el ancho | Los componentes pre-calculan su "forma de reaccionar" a distintos constraints, no recalculan desde cero |
| Canvas `measureText()` evita DOM layout porque va directo al font engine | El framework debe exponer APIs que eviten reflows — no depender de `getBoundingClientRect()` en loops |
| Cache `Map<font, Map<segment, metrics>>` evita re-medir | El framework debe cachear agresivamente resultados de preparación, no solo memoizar renders |
| `PreparedText` es opaco — oculta internos con brand types | Los "prepared components" no exponen su estructura interna, permitiendo optimizaciones futuras |
| `simpleLineWalkFastPath` detecta casos que no necesitan el walker completo | El framework debe detectar actualizaciones "triviales" (solo texto, solo style) y tomar fast paths |
| Lazy computation de grapheme widths y emoji counts | Los facts costosos se computan on-demand, no upfront |
| lineFitEpsilon es un shim mínimo justificado por evidencia | Los shims browser-specific son válidos si son MÍNIMOS y están justificados por datos |
| Preprocessing semántico compró más precisión que runtime corrections | Las transformaciones en prepare() son más efectivas que hacks en el hot path |

### 21.3 Anti-patterns que aplican al framework

Estos son los patterns que **fallaron** en pretext y que el framework debe evitar:

| Anti-pattern | Por qué falló | Equivalente en un framework |
| -------------- | --------------- | ---------------------------- |
| Medición de strings en `layout()` | Reintroduce canvas al hot path | Leer DOM dimensions en el loop de actualización |
| Pair correction models | Demasiado local, no movía los misses reales | Micro-optimizaciones que no atacan el cuello de botella real |
| Lookup tables para system-ui | No confiables cross-browser/version | Hardcodear valores que dependen de ambiente |
| Mover break policy a `layout()` | Regresó el benchmark | Mover lógica compleja al hot path "porque parece más correcto" |
| Full-string verification | Perf overhead no justificado por accuracy ganada | Validaciones exhaustivas en cada frame |
| DOM-based measurement en prepare | Reintroduce reflows | Usar el DOM como fuente de verdad para cálculos |

### 21.4 El mantra: "El DOM es solo la pantalla de salida"

De `thoughts.md`:

> *"80% of CSS spec could be avoided if userland had better control over text. The paradigm of web layout shoves our text into a single-direction black hole, and to crawl those text metrics back incurs huge maintenance and performance overhead."*

**Traducción para el framework:**

El DOM no debe ser:

- ❌ La fuente de verdad para dimensiones y posiciones
- ❌ El lugar donde se hace diffing para detectar cambios
- ❌ El sistema de reactividad (via MutationObserver etc.)

El DOM debe ser:

- ✅ El destino final de escrituras batcheadas
- ✅ Write-only output después de que todos los cálculos terminaron

### 21.5 El patrón completo para un update cycle

```Text
┌──────────────────────────────────────────────────────────────────┐
│                    ESTADO DE LA APLICACIÓN                        │
│            (observable store, signals, atoms, etc.)               │
└───────────────────────────┬──────────────────────────────────────┘
                            │ cambio de estado
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│              FASE 1: ANÁLISIS DE CAMBIOS                          │
│              ─────────────────────────                            │
│  • Diff puro entre estado anterior y nuevo                        │
│  • Identificar qué "prepared handles" necesitan actualizarse      │
│  • Detectar fast paths (¿solo cambió texto? ¿solo un style?)      │
│                                                                   │
│  [Puede usar caches, puede ser async, puede correr en worker]     │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│              FASE 2: PREPARACIÓN DE COMPONENTES                   │
│              ──────────────────────────────                       │
│  • Re-prepare() solo los handles afectados                        │
│  • Calcular "deltas estructurales" (qué nodos agregar/remover)    │
│  • Calcular "deltas de atributos" (qué props cambiar)             │
│  • Todo en memoria — SIN TOCAR EL DOM                             │
│                                                                   │
│  [Puede cachear agresivamente, lazy compute lo costoso]           │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│              FASE 3: REFLOW ARITMÉTICO                            │
│              ─────────────────────────                            │
│  • Dado el container width actual, calcular posiciones/tamaños    │
│  • Usando SOLO aritmética sobre prepared handles                  │
│  • Cero lecturas DOM — los constraints vienen de un resize event  │
│                                                                   │
│  [HOT PATH — sub-milisegundo obligatorio]                         │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│              FASE 4: COMMIT BATCHEADO                             │
│              ───────────────────────                              │
│  • Aplicar TODAS las escrituras DOM de una sola vez               │
│  • Sin lecturas intercaladas                                      │
│  • Usar DocumentFragment si se agregan muchos nodos               │
│  • requestAnimationFrame para sync con el browser                 │
│                                                                   │
│  [Escribir secuencialmente: removes → updates → inserts]          │
└──────────────────────────────────────────────────────────────────┘
```

### 21.6 Mapeo de conceptos pretext → framework

| Concepto pretext | Concepto framework | Descripción |
| ------------------ | ------------------- | ------------- |
| `PreparedText` | `PreparedComponent` | Handle opaco con todo lo necesario para calcular layout |
| `prepare(text, font)` | `prepare(props, context)` | Análisis y pre-cálculo que solo depende de los datos |
| `layout(prepared, maxWidth, lineHeight)` | `reflow(prepared, constraints)` | Aritmética pura que depende del viewport actual |
| `SegmentMetrics` cache | `ComponentMetrics` cache | Cache de mediciones costosas por (tipo, props) |
| `simpleLineWalkFastPath` | Fast path detection | Detectar casos simples que no necesitan el pipeline completo |
| `clearCache()` | Cache invalidation | Limpiar caches cuando cambia el contexto global (theme, locale) |
| `walkLineRanges()` | `walkChanges()` | Iterar cambios sin materializar objetos intermedios |
| `layoutNextLine()` | `applyNextChange()` | Aplicación incremental para constraints variables |

### 21.7 Garantías de performance del hot path

El hot path del framework (fase 3 + fase 4) debe garantizar:

```typescript
interface HotPathGuarantees {
  // PROHIBIDO
  domReads: false              // Cero getBoundingClientRect, offsetHeight, etc.
  canvasCalls: false           // Cero measureText en el hot path
  stringOperations: false      // Cero concat, split, template literals
  newArrays: 'minimal'         // Solo el array de resultados final
  newObjects: 'minimal'        // Solo objetos literales de resultado
  
  // PERMITIDO
  arithmeticOperations: true   // Sumas, restas, multiplicaciones
  arrayIndexAccess: true       // arr[i], TypedArray access
  mapLookup: true              // cache.get(key)
  comparisons: true            // ===, <, >, &&, ||
}
```

### 21.8 Preguntas abiertas para el diseño del framework

1. **¿Cómo expresar componentes que se "preparan"?**
   - ¿Un compilador que transforma JSX/templates?
   - ¿Una API de componentes que separa props "estáticos" de props "dinámicos"?
   - ¿Signals/atoms que triggean re-prepare vs re-layout automáticamente?

2. **¿Dónde corre la fase de preparación?**
   - Main thread con yielding (como React Concurrent)
   - Web Worker dedicado
   - Híbrido con OffscreenCanvas para componentes con texto

3. **¿Cómo manejar componentes que genuinamente necesitan mediciones DOM?**
   - ¿Un "escape hatch" explícito que documenta el costo?
   - ¿Batching de lecturas DOM antes de cualquier escritura?
   - ¿API de "measure layout" que es async y se resuelve entre frames?

4. **¿Cómo integrar con el ecosistema existente (React, Vue, etc.)?**
   - ¿Como una capa de virtualización que wrappea componentes?
   - ¿Como un renderer alternativo (like react-three-fiber)?
   - ¿Como un sistema de layout que se usa ANTES de React?

5. **¿Cuál es el equivalente del "font" en el contexto de componentes?**
   - En pretext, `font` determina el cache bucket y las mediciones
   - En componentes, ¿es el "tipo" + "theme" + "viewport category"?

---

## 22. La visión del autor (de thoughts.md)

Chen Glou articula una visión que va más allá de pretext:

> *"My personal desire is to see end-developers being empowered to make all the layouts that makes UI more expressive, without sacrificing maintainability & performance, and without having to wait for permissions from the web committee."*

El problema actual con CSS según el autor:

1. **Single-direction black hole** — metemos contenido en el DOM y no podemos saber cuánto espacio ocupará sin forzar un reflow
2. **Convenience erosion** — cuanta más expresividad bake-eamos en CSS, peor es el performance
3. **Spec bottleneck** — las specs del browser fueron escritas décadas atrás y son el cuello de botella para mejoras

La solución propuesta:

> *"The only way to circumvent this is to bring more capabilities to userland, in a hope to stop the spec from over-growing even more in the future."*

**pretext es un proof-of-concept de este enfoque:** en vez de esperar a que el browser nos dé mejor control sobre text layout, implementamos nuestro propio engine que usa las primitivas de bajo nivel disponibles (canvas, Intl.Segmenter) para hacer lo que el CSS no puede hacer eficientemente.

El framework debería seguir el mismo camino: usar las primitivas disponibles del browser para implementar un sistema de layout que no dependa del DOM para cálculos, solo para output final.

---

## 23. Conclusión: El contrato del framework

Un framework construido sobre estos principios tendría este contrato:

```Text
DADO: un árbol de componentes con su estado actual
Y: un cambio en el estado de la aplicación
Y: las constraints del viewport (width, height, scroll position)

EL FRAMEWORK GARANTIZA:
1. Calcular EXACTAMENTE qué nodos DOM necesitan cambiar — sin leer el DOM
2. Calcular EXACTAMENTE las posiciones y tamaños — usando aritmética pura
3. Aplicar los cambios en UN solo batch de escrituras
4. Completar el hot path en < 1ms para árboles de hasta 10,000 componentes

EL DESARROLLADOR SE COMPROMETE A:
1. Declarar qué props de sus componentes afectan "forma" (necesitan re-prepare)
2. Declarar qué props solo afectan "valores" (solo necesitan re-layout)
3. Usar el "escape hatch" de medición DOM solo cuando es genuinamente necesario
4. No mutar el DOM directamente fuera del framework
```

El siguiente paso es diseñar la API concreta del framework que implementa estos principios. El documento `SPEC-TEXT-LAYOUT-ENGINE.md` sirve como referencia de cómo se ve una implementación exitosa de estas ideas en el dominio específico del texto.
