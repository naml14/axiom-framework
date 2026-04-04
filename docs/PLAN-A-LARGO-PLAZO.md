# Planteamiento

A continuación, un plan dividido en **dos horizontes**:

1. **Plan detallado (inmediato)** – funcionalidades esenciales para considerar el framework "completo" y autosuficiente.  
2. **Plan a largo plazo (post‑v1.0)** – mejoras de rendimiento, DX y ecosistema.

Todo manteniendo **Bun** como runtime, **cero dependencias externas** (salvo las que ya usan, como Happy DOM para tests) y respetando la arquitectura actual (prepare/reflow/commit, señales push/pull).

---

## Plan de Desarrollo para la Próxima Versión (v0.3.0 → v1.0.0)

Basado en el código existente (`signals.ts`, `component.ts`, `app.ts`, `prepare.ts`, `reflow.ts`, `commit.ts`, `diff.ts`, `flex.ts`, `fast-path.ts`, `scheduler.ts`, `types.ts`).

---

## Parte A – Plan detallado (inmediato)

*Objetivo: funcionalidades mínimas para un SPA completo + SSR que permita construir la landing page.*

### Sprint 1 – Enrutador declarativo (SPA)

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

### Sprint 2 – SSR básico (renderizado en servidor)

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
- Modificar `commit.ts` para permitir hidratación (comparar nodos existentes en lugar de crearlos).

**Pruebas:** Comparar salida HTML con renderizado en cliente.

---

### Sprint 3 – Formularios reactivos (bindings y validación)

**Qué falta:** No hay bindings de dos vías ni validación integrada.  
**Implementación:** Pequeña extensión de señales + directivas.

- `bind(signal, inputElement)` → actualiza señal cuando el input cambia, y viceversa.
- `validate(signal, rules)` → señal derivada que devuelve errores.
- Componentes `Input`, `Form` de ejemplo (opcional, pero útil para documentación).

**Impacto:**

- Extender `signals.ts` con utilidades (no cambios en núcleo).
- Nuevo `forms.ts` (usando `effect` para escuchar eventos DOM).  
- Opcional: integración con `on` de `ElementNode` para eventos personalizados.

**Pruebas:** Binding, validación síncrona/asíncrona.

---

### Sprint 4 – Estado global (Context / Store)

**Qué falta:** No hay forma de compartir estado entre componentes sin prop drilling.  
**Implementación:** API ligera basada en señales y contexto.

- `createContext<T>(initialValue: T)` → devuelve `Provider` y `useContext`.
- `Provider` es un componente que inyecta una señal en el árbol mediante un `Map` débil (sin dependencias externas).
- `useContext(context)` → devuelve la señal del provider más cercano.

**Alternativa más simple:** `createStore` que devuelve un objeto con señales y un `provideStore`/`injectStore`.  
**Impacto:** Nuevo `context.ts` (menos de 100 líneas).  
**Pruebas:** Acceso a contexto anidado, actualizaciones reactivas.

---

### Sprint 5 – Portales (renderizado fuera del nodo raíz)

**Qué falta:** Modales, tooltips, notificaciones necesitan DOM fuera del `root`.  
**Implementación:** `createPortal(children, targetElement)`.  

- `Portal` es un componente especial que en `commit` escribe directamente en `targetElement` en lugar de en el árbol padre.
- Durante `prepare` y `reflow`, el portal se comporta como un nodo vacío (no ocupa layout).
- Manejar la limpieza del portal en `unmount`.

**Impacto:** Modificar `commit.ts` (fase de inserción) y `prepare.ts` (marcar tipo `'portal'`).  
**Pruebas:** Portal que se mueve entre padres, eliminación del DOM.

---

### Sprint 6 – Mejoras de DX (hot reload, errores, profiling)

**Qué falta:** Experiencia de desarrollo aún básica.  
**Implementación:**

- **Hot reload** (Bun ya soporta `bun --hot`). Integrar con el scheduler: cuando un componente cambia, re‑ejecutar `prepare` del árbol y hacer diff.
- **Errores claros:** Añadir nombres a los componentes (`Component.displayName`) y mostrarlos en trazas.
- **Profiling integrado:** `app.getMetrics()` ya existe. Extender con `app.enableProfiling()` que emita eventos (pueden verse en consola).
- **Devtools hook:** Exponer `window.__AXIOM__` con el árbol interno (solo en desarrollo).

**Impacto:**

- Modificar `component.ts` para guardar `displayName`.  
- Extender `app.ts` con opciones de desarrollo.  
- Nuevo `devtools.ts` (opcional, condicional).

**Pruebas:** Verificar que hot reload no cause fugas (ya hay `fireUnmountEvents`).

---

### Sprint 7 – Construir la landing page con Axiom

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
- **Versionado:** Seguir Semver. La Parte A puede lanzarse como `v0.3.0`, `v0.4.0`, etc., hasta `v1.0.0` después de la landing page.

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
