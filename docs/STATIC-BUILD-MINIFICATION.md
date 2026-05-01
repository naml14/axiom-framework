# Static Build Minification Strategy

> Estado: **IMPLEMENTADA** — API `buildStatic()` disponible en `src/build.ts`  
> Issue relacionada: [#48 — feat(build): static site generation con minificación por defecto](https://github.com/naml14/axiom-framework/issues/48)  
> Fecha: 2026-04-24 (propuesta) / 2026-05-01 (implementada)

---

## 1. Resumen ejecutivo

Axiom necesita tratar la minificación como una responsabilidad explícita del **pipeline de build estático**, no del runtime general ni del paquete npm de la librería.

La regla arquitectónica queda así:

```text
dist/ como librería npm       → NO minificar
bundle browser final          → SÍ minificar
HTML/CSS generado estático    → SÍ minificar en build
renderToString()              → NO debe encargarse de minificar
```

La motivación inicial vino de revisar el archivo `demo/app.js` usado por `demo/static.html`: el bundle del navegador se estaba generando sin `minify: true`, por lo que ocupaba más de lo necesario. Ese caso ya tiene un fix táctico en `demo/build.ts`, pero el problema real es mayor: cualquier usuario que use Axiom como framework frontend para generar páginas estáticas necesita una ruta oficial para producir artefactos minificados.

La solución propuesta es exponer una API pública de build estático, por ejemplo `buildStatic()`, donde `minify: true` sea el comportamiento por defecto.

---

## 2. Contexto

Axiom es un framework frontend con renderizado en dos fases:

```text
prepare() → análisis y métricas en memoria
reflow()  → layout aritmético puro
commit()  → escrituras DOM batcheadas
```

Además, el proyecto ya tiene una ruta SSR mediante `renderToString()` en `src/ssr.ts`. Esa función puede producir HTML completo:

```html
<!DOCTYPE html><html><head>...</head><body><div id="app">...</div></body></html>
```

Actualmente, el demo usa `Bun.build()` en `demo/build.ts` para generar el bundle browser `demo/app.js`.

Antes del fix táctico, la llamada era conceptualmente así:

```typescript
await Bun.build({
  entrypoints: ['demo/app.ts'],
  outdir: 'demo',
  target: 'browser',
})
```

El problema: faltaba `minify: true`.

El fix táctico deja el demo así:

```typescript
await Bun.build({
  entrypoints: ['demo/app.ts'],
  outdir: 'demo',
  target: 'browser',
  minify: true,
})
```

Eso corrige el demo, pero NO resuelve todavía la experiencia del usuario final del framework.

---

## 3. Separación crítica: librería vs artefacto final

Este punto es importante porque es fácil confundirse.

### 3.1 `dist/` como librería npm

El directorio `dist/` contiene la salida compilada de TypeScript que se publica como librería npm:

```json
{
  "main": "dist/index.js",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "sideEffects": false
}
```

Ese código **no debe minificarse** por defecto.

Razones:

1. **El consumidor final tendrá su propio bundler**: Vite, Webpack, Rollup, esbuild, Bun, etc.
2. **La minificación temprana puede dificultar el tree-shaking**: el bundler consumidor necesita entender módulos, exports y estructura.
3. **`sideEffects: false` ya comunica que el paquete es tree-shakeable**.
4. **Los source maps y `.d.ts` son más útiles si el JS emitido conserva estructura legible**.

Por tanto:

```text
Compilar librería npm ≠ generar aplicación optimizada
```

La librería se publica clara, modular y tree-shakeable. La aplicación final se minifica cuando se construye.

### 3.2 Bundle browser final

Un archivo como `demo/app.js` es distinto. Ese archivo ya es un **artefacto final para navegador**.

Nadie lo va a reprocesar después. Se sirve directamente desde HTML.

Por tanto, debe salir minificado.

```text
demo/app.ts → Bun.build → demo/app.js → navegador
```

En ese flujo, `minify: true` es correcto y necesario.

### 3.3 HTML/CSS generado estático

Si Axiom genera páginas estáticas, los artefactos finales típicos son:

```text
dist-static/
  index.html
  about/index.html
  assets/app.[hash].js
  assets/style.[hash].css
```

Todos esos archivos deberían estar optimizados para producción:

- JS minificado
- HTML compacto
- CSS inline minificado
- Comentarios removidos
- Whitespace innecesario eliminado cuando sea seguro

---

## 4. Problema actual

El framework tiene piezas separadas:

- `renderToString()` puede generar HTML.
- `Bun.build()` puede generar un bundle browser.
- El demo usa una lógica propia en `demo/build.ts`.

Pero no hay una API pública que le diga al usuario:

> “Dame tus rutas/componentes y Axiom te genera el sitio estático optimizado.”

Eso deja al consumidor con demasiada responsabilidad accidental:

1. Debe saber llamar `renderToString()`.
2. Debe saber configurar `Bun.build()`.
3. Debe recordar `minify: true`.
4. Debe decidir cómo escribir rutas a disco.
5. Debe manejar HTML, JS, CSS y assets por separado.
6. Debe evitar minificar la librería incorrecta.

Eso no es una buena experiencia de framework. Es como entregar ladrillos, cemento y planos, pero no una ruta clara para levantar la casa.

Axiom debe mantener la filosofía de rendimiento también en el build:

```text
Runtime rápido + build descuidado = producto incompleto
```

---

## 5. Decisión propuesta

Crear una API pública de generación estática donde la minificación esté activada por defecto.

Nombre tentativo:

```typescript
buildStatic()
```

Contrato principal:

```typescript
await buildStatic({
  routes: [
    { path: '/', component: HomePage },
    { path: '/about', component: AboutPage },
  ],
  outDir: './dist',
  clientEntry: './src/client.ts',
})
```

El comportamiento por defecto debe ser:

```typescript
minify: true
```

Si el usuario quiere debuggear:

```typescript
await buildStatic({
  routes,
  outDir: './dist-debug',
  clientEntry: './src/client.ts',
  minify: false,
})
```

La idea clave: producción optimizada debe ser el camino fácil. El modo no-minificado debe ser opt-out explícito.

---

## 6. Por qué `renderToString()` NO debe minificar

`renderToString()` debe permanecer simple y predecible:

```typescript
component + options → html string
```

No debe convertirse en un mini-build-system.

Razones:

1. **Separación de responsabilidades**
   - `renderToString()` renderiza.
   - `buildStatic()` optimiza y escribe artefactos.

2. **Testabilidad**
   - Es más fácil probar SSR puro sin introducir reglas de minificación.

3. **Debugging**
   - En desarrollo puede ser útil inspeccionar HTML legible.

4. **Evitar costo runtime**
   - La minificación pertenece a build-time, no a cada llamada SSR.

5. **Futuro SSR dinámico**
   - Si Axiom soporta SSR dinámico por request, no queremos minificar agresivamente en cada request salvo que el usuario lo pida.

Por eso, la regla debe ser:

```text
renderToString() → genera HTML correcto
buildStatic()    → genera HTML correcto y optimizado
```

---

## 7. Diseño técnico sugerido

### 7.1 Tipos iniciales

```typescript
import type { ComponentDefinition } from './core/types.js'
import type { SSRMetadata, SSRRenderOptions } from './ssr.js'

export interface StaticRoute {
  path: string
  component: ComponentDefinition<void>
  metadata?: SSRMetadata
  renderOptions?: Omit<SSRRenderOptions, 'metadata'>
}

export interface BuildStaticOptions {
  routes: StaticRoute[]
  outDir: string
  clientEntry?: string
  minify?: boolean
  rootId?: string
}
```

### 7.2 API básica

```typescript
export async function buildStatic(options: BuildStaticOptions): Promise<void> {
  const minify = options.minify ?? true

  for (const route of options.routes) {
    const html = renderToString(route.component, {
      ...route.renderOptions,
      metadata: route.metadata,
      rootId: options.rootId,
    })

    const output = minify ? minifyHtml(html) : html
    await writeRouteHtml(options.outDir, route.path, output)
  }

  if (options.clientEntry !== undefined) {
    await Bun.build({
      entrypoints: [options.clientEntry],
      outdir: join(options.outDir, 'assets'),
      target: 'browser',
      minify,
    })
  }
}
```

Nota: si se quiere evitar que el core dependa directamente de Bun types, puede ubicarse en un subpath separado:

```text
axiom-framework/build
```

o:

```text
src/build/static.ts
```

exportado como:

```json
"./build": {
  "types": "./dist/build/index.d.ts",
  "import": "./dist/build/index.js"
}
```

### 7.3 Escritura de rutas

Reglas sugeridas:

```text
/           → outDir/index.html
/about      → outDir/about/index.html
/docs/intro → outDir/docs/intro/index.html
```

Evitar escribir directamente `about.html` porque el formato de carpetas con `index.html` funciona mejor para hosts estáticos.

### 7.4 Minificación HTML mínima segura

No hace falta empezar con un minificador agresivo. Una primera versión puede hacer:

1. Remover comentarios HTML seguros.
2. Colapsar whitespace entre tags:

    ```text
    >   <  → ><
    ```

3. Preservar contenido de elementos raw-text:

    ```html
    <script>...</script>
    <style>...</style>
    <textarea>...</textarea>
    <pre>...</pre>
    ```

4. No tocar texto visible donde el whitespace pueda ser semántico.

El SSR actual ya produce HTML bastante compacto, así que la ganancia inicial estará más en:

- JS minificado
- CSS inline compactado
- comentarios removidos si existen

### 7.5 Minificación CSS inline

`SSRMetadata` permite:

```typescript
inlineStyles?: string
```

Ese CSS se emite en:

```html
<style>...</style>
```

En build estático, si `minify: true`, debería pasar por una compactación básica:

```css
body {
  margin: 0;
  color: white;
}
```

→

```css
body{margin:0;color:white}
```

Primera versión posible sin dependencia externa:

```typescript
function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim()
}
```

Advertencia: esto es una minificación básica. No debe intentar optimizaciones semánticas complejas sin tests fuertes.

---

## 8. Dogfooding obligatorio

Cuando exista `buildStatic()`, el demo debe migrarse para usar esa API.

Eso evita que el demo y la API real diverjan.

Objetivo:

```text
demo/build.ts no debe tener un pipeline paralelo permanente
```

El demo debería convertirse en cliente de la API pública:

```typescript
import { buildStatic } from '../src/build/static.js'

await buildStatic({
  routes: [
    { path: '/', component: DemoPage },
    { path: '/static', component: StaticDemoPage },
  ],
  outDir: './demo-dist',
  clientEntry: './demo/app.ts',
})
```

El beneficio es fuerte:

- La API se prueba en un caso real.
- El demo documenta el uso correcto.
- Cualquier bug del build aparece temprano.

Si el framework no usa su propia API de build, hay una señal de diseño débil.

---

## 9. Tradeoffs

### Opción A: solo `minify: true` en el demo

Ventajas:

- Cambio pequeño.
- Sin nueva API.
- Corrige el archivo observado (`demo/app.js`).

Desventajas:

- No ayuda al consumidor real.
- No crea contrato de framework.
- El problema reaparece en cada app que el usuario cree.

Conclusión: correcto como fix táctico, insuficiente como solución.

### Opción B: documentar en README cómo usar `Bun.build({ minify: true })`

Ventajas:

- Simple.
- Sin mantenimiento de API nueva.

Desventajas:

- Depende de que el usuario lea y recuerde.
- Expone detalles accidentales.
- No garantiza outputs consistentes.

Conclusión: útil como complemento, no como solución principal.

### Opción C: `buildStatic()` programático

Ventajas:

- API clara para usuarios avanzados.
- Testeable.
- Composable con scripts propios.
- Mantiene Bun como toolchain oficial.

Desventajas:

- Aumenta superficie pública.
- Debe diseñarse cuidadosamente para no acoplar demasiado el core a Bun.

Conclusión: mejor primer paso serio.

### Opción D: CLI `axiom build`

Ventajas:

- Mejor DX para usuarios.
- Cero boilerplate.
- Ideal para documentación y quickstart.

Desventajas:

- Requiere diseñar configuración, resolución de rutas, errores bonitos.
- Más mantenimiento.

Conclusión: buen paso posterior sobre `buildStatic()`.

### Opción E: integrar Vite/Rollup/Webpack

Ventajas:

- Ecosistema maduro.
- Plugins existentes.

Desventajas:

- Añade dependencias y complejidad.
- Rompe la coherencia Bun-first del proyecto.
- Duplica responsabilidades que Bun ya cubre.

Conclusión: no recomendado para la primera implementación.

---

## 10. Criterios de aceptación para la issue #48

La issue debe considerarse resuelta solo si se cumple lo siguiente:

1. Existe una API pública documentada para build estático.

    ```typescript
    await buildStatic({
      routes,
      outDir,
      clientEntry,
    })
    ```

2. `minify: true` es el default.

3. Existe opt-out explícito:

    ```typescript
    minify: false
    ```

4. El bundle cliente usa:

    ```typescript
    Bun.build({
      target: 'browser',
      minify: true,
    })
    ```

5. El HTML final se compacta de forma segura.

6. El CSS inline se compacta cuando `minify: true`.

7. El demo usa la API pública o al menos está alineado con ella.

8. Hay tests que cubren:

   - generación de rutas
   - default `minify: true`
   - opt-out `minify: false`
   - HTML compacto
   - CSS inline compacto
   - propagación de errores de `Bun.build`

9. README o docs incluyen ejemplo mínimo.

10. No se minifica `dist/` como librería npm.

---

## 11. Riesgos y mitigaciones

### Riesgo 1: minificar HTML rompiendo contenido visible

Mitigación:

- No colapsar whitespace dentro de texto arbitrario en primera versión.
- Limitarse a whitespace entre tags y comentarios seguros.
- Preservar `pre`, `textarea`, `script`, `style`.

### Riesgo 2: acoplar el core a Bun

Mitigación:

- Ubicar build estático en un módulo separado.
- Mantener runtime core sin dependencia directa de build APIs.
- Considerar subpath export `axiom-framework/build`.

### Riesgo 3: crear una API pública demasiado pronto

Mitigación:

- Marcar como experimental inicialmente.
- Documentar contrato mínimo.
- Evitar opciones excesivas en v1.

### Riesgo 4: confundir minificación de librería con minificación de app

Mitigación:

- Documentar explícitamente esta diferencia.
- Mantener `package.json`/`tsconfig.build.json` sin minificar `dist/`.

---

## 12. Principio final

La minificación no es un detalle cosmético. En un framework frontend, forma parte de la promesa de performance.

Pero debe estar en el lugar correcto:

```text
NO en el paquete npm base.
NO escondida dentro de renderToString().
SÍ en el pipeline de build estático.
SÍ como default para artefactos finales.
```

Si Axiom quiere ser un framework serio para sitios estáticos y aplicaciones frontend, debe garantizar que el camino recomendado genere outputs listos para producción.

La experiencia correcta para el usuario debería ser:

```text
Defino rutas → llamo buildStatic() → obtengo sitio estático minificado
```

No:

```text
Defino rutas → aprendo SSR interno → aprendo Bun.build → recuerdo minify → escribo mi propio pipeline
```

Esa diferencia es la que separa una librería útil de un framework bien diseñado.
