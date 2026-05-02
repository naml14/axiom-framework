# Planteamiento

A continuación, un plan dividido en **dos horizontes**:

1. **Plan detallado (inmediato)** – funcionalidades esenciales para considerar el framework "completo" y autosuficiente.  
2. **Plan a largo plazo (post‑v1.0)** – mejoras de rendimiento, DX y ecosistema.

Todo manteniendo **Bun** como runtime, **cero dependencias externas** (salvo las que ya usan, como Happy DOM para tests) y respetando la arquitectura actual (prepare/reflow/commit, señales push/pull).

> **Nota de actualización (2026-04-15):** este plan mantiene contexto temporal de sprints, pero las rutas operativas referenciadas se ajustaron al árbol híbrido actual de `src/`.

---

## Cómo funciona el versionado (release-please)

Este proyecto usa [release-please](https://github.com/googleapis/release-please) con la siguiente configuración en `release-please-config.json`:

```json
"bump-minor-pre-major": true
"bump-patch-for-minor-pre-major": true
```

Mientras la versión sea `< 1.0.0`, las reglas son:

| Tipo de commit | Bump generado | Ejemplo |
| --- | --- | --- |
| `fix:` | **patch** | `0.2.3 → 0.2.4` |
| `feat:` | **patch** (reducido de minor) | `0.2.3 → 0.2.4` |
| `feat!:` o `BREAKING CHANGE:` | **minor** (reducido de major) | `0.2.3 → 0.3.0` |

**Consecuencia directa:** cada sprint de nuevas funcionalidades (`feat:`) genera un bump de **patch**, no de minor. Para llegar a `1.0.0` se usará `release-as: 1.0.0` en la config cuando el proyecto esté listo (ver Sprint 7).

---

## Plan de Desarrollo (v0.2.3 → v1.0.0)

Basado en el código existente (`src/reactivity/signals.ts`, `src/render/component.ts`, `src/app.ts`, `src/render/prepare.ts`, `src/render/reflow.ts`, `src/render/commit.ts`, `src/render/diff.ts`, `src/render/engines/flex.ts`, `src/render/engines/fast-path.ts`, `src/scheduler.ts`, `src/core/types.ts`).

Estado actual: **v0.2.3** — signals, layout engine, forms, context/store.

---

## Parte A – Plan detallado (inmediato)

*Objetivo: funcionalidades mínimas para un SPA completo + SSR que permita construir la landing page.*

### ✅ Sprint 3 – Formularios reactivos (bindings y validación) → **v0.2.3** (lanzado)

**Commits:** `feat(forms):` + `feat(context):` → patch bump `0.2.2 → 0.2.3`

**Qué se implementó:**

- `bind(signal, inputElement)` → two-way binding para `input`, `textarea`, `select`.
- `validate(signal, rules)` → señal derivada con debounce + generación para reglas async.
- Built-ins: `required`, `minLength`, `maxLength`, `pattern` en `src/features/forms.ts`.

---

### ✅ Sprint 4 – Estado global (Context / Store) → **v0.2.3** (lanzado, junto con Sprint 3)

**Commits:** `feat(context):` → incluido en el mismo patch bump `0.2.2 → 0.2.3`

**Qué se implementó:**

- `createContext<T>`, `withContext`, `useContext` → scoping por call-stack (como React/Solid).
- `createStore`, `provideStore`, `injectStore` → DI basado en el mismo mecanismo de contexto.
- Todo en `src/features/context.ts` (~120 líneas, cero dependencias externas).

---

### Sprint 5 – Portales (renderizado fuera del nodo raíz) → **v0.2.4**

**Commits esperados:** `feat(portal):` → patch bump `0.2.3 → 0.2.4`

**Qué falta:** Modales, tooltips, notificaciones necesitan DOM fuera del `root`.  
**Implementación:** `createPortal(children, targetElement)`.

- `Portal` es un componente especial que en `commit` escribe directamente en `targetElement` en lugar de en el árbol padre.
- Durante `prepare` y `reflow`, el portal se comporta como un nodo vacío (no ocupa layout).
- Manejar la limpieza del portal en `unmount`.

**Impacto:** Modificar `src/render/commit.ts` (fase de inserción) y `src/render/prepare.ts` (marcar tipo `'portal'`).  
**Pruebas:** Portal que se mueve entre padres, eliminación del DOM.

---

### Sprint 1 – Enrutador declarativo (SPA) → **v0.2.5**

**Commits esperados:** `feat(router):` → patch bump `0.2.4 → 0.2.5`

**Qué falta:** No hay navegación entre páginas.  
**Implementación:** Router propio sin dependencias, basado en History API y señales.

- `createRouter(routes: Route[])` → devuelve objeto con señal `$route` (path, params, query) y métodos `push`, `replace`, `go`.
- Soporte para rutas anidadas y parámetros (ej. `/user/:id`).
- Integración con el ciclo de renderizado: cuando cambia `$route`, se re‑ejecuta el componente raíz (efecto automático).
- Lazy loading de componentes: `defineAsyncComponent(() => import('./Page.js'))`.

**Impacto en archivos:**

- Nuevo `router.ts` (usa `signal`, `effect` existentes).
- Modificar `createApp` opcionalmente para aceptar `router` y suscribirse a cambios.

**Pruebas:** Navegación, parámetros, lazy loading (simulando imports).

---

### Sprint 2 – SSR básico (renderizado en servidor) → **v0.2.6**

**Commits esperados:** `feat(ssr):` → patch bump `0.2.5 → 0.2.6`

**Qué falta:** No se puede renderizar en servidor (necesario para SEO y rendimiento de landing page).  
**Implementación:** Usar `Bun.serve` y reutilizar el pipeline `prepare` + `reflow` en Node.js/Bun sin DOM.

- Extraer la lógica de layout (`prepare` + `reflow`) a un módulo que devuelva `LayoutResult` (arrays de posiciones).
- Nuevo `renderToString(app, url)`:  
  1. Ejecuta `prepare` (sin DOM).  
  2. Ejecuta `reflow` con constraints simuladas (ventana viewport).  
  3. Genera HTML string a partir del árbol preparado + posiciones (usa `getTag`, `getClasses`, `getAttrs`, `getTextContent`).  
  4. Inyecta el HTML en un esqueleto (puede usar `index.html` plantilla).
- Soporte para hidratación en cliente (reutilizar DOM generado por SSR).

**Impacto:**

- Nuevo `ssr.ts` (usa `prepare`, `reflow` sin `commit`).  
- Modificar `src/render/commit.ts` para permitir hidratación (comparar nodos existentes en lugar de crearlos).

**Pruebas:** Comparar salida HTML con renderizado en cliente.

---

### Sprint 6 – Mejoras de DX (hot reload, errores, profiling) → **v0.2.7**

**Commits esperados:** `feat(devtools):` → patch bump `0.2.6 → 0.2.7`

**Qué falta:** Experiencia de desarrollo aún básica.  
**Implementación:**

- **Hot reload** (Bun ya soporta `bun --hot`). Integrar con el scheduler: cuando un componente cambia, re‑ejecutar `prepare` del árbol y hacer diff.
- **Errores claros:** Añadir nombres a los componentes (`Component.displayName`) y mostrarlos en trazas.
- **Profiling integrado:** `app.getMetrics()` ya existe. Extender con `app.enableProfiling()` que emita eventos (pueden verse en consola).
- **Devtools hook:** Exponer `window.__AXIOM__` con el árbol interno (solo en desarrollo).

**Impacto:**

- Modificar `src/render/component.ts` para guardar `displayName`.  
- Extender `app.ts` con opciones de desarrollo.  
- Nuevo `devtools.ts` (opcional, condicional).

**Pruebas:** Verificar que hot reload no cause fugas (ya hay `fireUnmountEvents`).

---

### Sprint 7 – Construir la landing page con Axiom → **v1.0.0**

**Commits esperados:** `feat!: launch axiom-framework v1.0.0` con `release-as: 1.0.0` en `release-please-config.json`

> **Nota de versionado:** Este sprint marca la madurez del framework. El salto de `0.2.x` a `1.0.0` requiere agregar temporalmente `"release-as": "1.0.0"` al `release-please-config.json` antes de hacer el merge del Release PR. Una vez lanzado se elimina esa línea.

**Objetivo:** Demostrar que el framework es autosuficiente.

- Sitio web del proyecto (documentación, ejemplos, blog).
- Usar **SSR** para SEO y velocidad inicial.
- Usar **router** para páginas (inicio, docs, ejemplos).
- Usar **formularios** para suscripción a newsletter.
- Usar **portales** para modales de ejemplos de código.
- Medir rendimiento real y corregir errores encontrados.

**Resultado:** El primer sitio en producción con Axiom. Feedback para ajustes pre‑v1.0.

---

## Parte B – Plan a largo plazo (post‑v1.0)

*Detalles poco profundos, funcionalidades deseables.*

### 1. Animaciones y transiciones

- Integrar con el ciclo `reflow → commit`.  
- Soporte para `animate` en `LayoutProps` (transiciones de posición/tamaño).  
- Basado en `WAAPI` (Web Animations API) o CSS transitions.

### 2. Optimización de memoria

- Reutilizar objetos `Float32Array` entre renders (evitar crear nuevos).  
- Pool de nodos preparados (cache de `prepare` para componentes estáticos).

### 3. Sistema de plugins (middlewares para efectos)

- Permitir hooks antes/después de `prepare`, `reflow`, `commit`.  
- Ejemplo: logger, rate limiter de render, persistencia de estado.

### 4. Herramientas de testing

- `renderComponent` para tests unitarios (sin DOM real, usando Happy DOM ya incluido).  
- `fireEvent` y `waitFor` utilitarios.

### 5. Documentación interactiva

- Generador de documentación a partir de comentarios JSDoc (similar a TypeDoc).  
- Playground en vivo (usando el mismo framework).

### 6. Soporte para serverless

- Adaptador para Bun (Fly.io, Railway) que use `Bun.serve` con SSR.  
- Opción de exportar sitio estático (SSG) desde el router.

### 7. Mejoras en el layout engine

- `flex-wrap: wrap` (ya lo tienen según CHANGELOG 0.2.2, verificar).  
- `gap` en filas y columnas (ya lo tienen).  
- Soporte para `align-content`.  
- Unidades relativas (%, vw, vh) en `width`/`height`.

---

## Consideraciones de implementación (para ambas partes)

- **Mantener la compatibilidad:** Las nuevas funcionalidades no deben romper la API actual. Usar `export` adicionales, no modificar contratos existentes.
- **Pruebas:** Cada sprint debe incluir pruebas con `Bun.test` (ya tienen infraestructura). Para SSR, usar `Bun.serve` local.
- **Documentación:** Actualizar el README y agregar guías de cada nueva característica.
- **Versionado:** Con la config actual de release-please (`bump-patch-for-minor-pre-major: true`), cada sprint de `feat:` genera un patch bump. El roadmap previsto es `0.2.3 → 0.2.4 → 0.2.5 → 0.2.6 → 0.2.7 → 1.0.0`. El salto final a `1.0.0` se hace manualmente con `release-as` (ver Sprint 7).

---

## Criterios de aceptación para v1.0.0

- [ ] El enrutador funciona con lazy loading y parámetros.
- [ ] SSR puede generar HTML para cualquier ruta y la hidratación funciona.
- [ ] Formularios con binding y validación cubren casos comunes.
- [ ] Contexto global permite compartir estado sin prop drilling.
- [ ] Los portales funcionan en modales y tooltips.
- [ ] La landing page está construida con Axiom y en producción.
- [ ] Todos los tests pasan en Bun (incluyendo los nuevos).
- [ ] No hay dependencias externas nuevas (todo implementado manualmente).
- [ ] El bundle size del core no supera los 15 KB gzipped (actual ~12 KB).

---
