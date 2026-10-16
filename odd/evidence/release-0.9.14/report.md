# Evidencia de navegador — PR #118 (0.9.14, head fe0e1be)

- Fecha: 2026-10-16T18:38:46.127Z
- Demo: http://localhost:3000 (servidor del worktree aislado)
- Checks: **34/39 PASS**, 5 FAIL

| Grupo | Check | Resultado | Detalle |
| --- | --- | --- | --- |
| http | GET / | ✅ | status=200 (esperado 200), bytes=5528, contenido=ok, headersDeSeguridad=todos |
| http | GET /static.html | ✅ | status=200 (esperado 200), bytes=18555, contenido=ok, headersDeSeguridad=todos |
| http | GET /ssr?name=Dev&width=960&root=ssr-root | ✅ | status=200 (esperado 200), bytes=7197, contenido=ok, headersDeSeguridad=todos |
| http | GET /ssr?name=Dev&width=720&root=ssr-root | ✅ | status=200 (esperado 200), bytes=7197, contenido=ok, headersDeSeguridad=todos |
| http | GET /ssr-stream | ✅ | status=200 (esperado 200), bytes=5961, contenido=ok, headersDeSeguridad=todos |
| http | GET /style.css | ✅ | status=200 (esperado 200), bytes=23933, contenido=ok, headersDeSeguridad=todos |
| http | GET /app.js | ✅ | status=200 (esperado 200), bytes=87583, contenido=ok, headersDeSeguridad=todos |
| http | GET /does-not-exist | ✅ | status=404 (esperado 404), bytes=9, contenido=ok, headersDeSeguridad=todos |
| http | GET /ssr-stream es chunked | ✅ | transfer-encoding=chunked |
| http | OPTIONS /ssr Origin=http://localhost:3000 | ✅ | status=204, access-control-allow-origin=http://localhost:3000 |
| http | OPTIONS /ssr Origin=http://evil.example | ✅ | status=204, access-control-allow-origin=(ausente) |
| http | traversal /../package.json | ✅ | status=404, fuga=no |
| http | traversal /..%2fpackage.json | ✅ | status=404, fuga=no |
| http | traversal /%2e%2e/package.json | ✅ | status=404, fuga=no |
| http | traversal /../.env | ✅ | status=404, fuga=no |
| estructura | roots Axiom montados en /static.html | ✅ | 11/11 con hijos: context-demo-root, forms-demo-root, router-demo-root, portal-demo-root, ruta-b-grid-root, syntax-flow-root, syntax-jsx-root, syntax-layout-root, syntax-h-v2-root, syntax-h-literal-root, syntax-events-root |
| estructura | invariantes iniciales /static.html | ❌ | overflow=3, solapamientos=0, fugas=10, overflowHorizontalDoc=0 |
| estructura | botones de contador en filas de <=3 | ✅ | [{"id":"context-demo-root","buttonsPerRow":[1,3,3],"total":7},{"id":"forms-demo-root","buttonsPerRow":[],"total":0}] |
| interaccion | click en 37 botones | ✅ | clickeados=37, fallos=0 |
| estructura | invariantes tras todos los clicks | ❌ | overflow=3, solapamientos=0, fugas=10, overflowHorizontalDoc=0 |
| interaccion | slider #width-slider reactivo | ✅ | valores leidos en #width-display: 474px / 926px / 1120px |
| interaccion | slider #items-slider reactivo | ✅ | valores leidos en #items-display: 5 / 20 / 60 |
| estructura | invariantes tras sliders al maximo | ❌ | overflow=3, solapamientos=0, fugas=10, overflowHorizontalDoc=0 |
| interaccion | router demo navega | ✅ | 5 salidas distintas: router-nav-home={
  "path": "/",
  "params": {},
  "quer \| router-nav-about={
  "path": "/about",
  "params": {},
   \| router-nav-users={
  "path": "/users",
  "params": {},
   \| router-nav-user-2={
  "path": "/users/2",
  "params": {
   \| router-nav-404={
  "path": "/this-route-does-not-exist" \| ro |
| interaccion | portal abre y cierra | ✅ | host=#portal-modal-root, dentro=true, 500x227; botonCerrar=true; modalDesmontado=true |
| interaccion | formulario: invalido detectado y valido aceptado | ❌ | invalidoDetectado=true, sinEstadoInvalidoTrasCorreoValido=false, campos=2 |
| responsive | /static.html a 390px sin overflow horizontal | ❌ | scrollWidth-clientWidth=14, fugas=10 |
| responsive | /static.html a 768px sin overflow horizontal | ✅ | scrollWidth-clientWidth=0, fugas=10 |
| responsive | /static.html a 1440px sin overflow horizontal | ✅ | scrollWidth-clientWidth=0, fugas=10 |
| launcher | links del launcher presentes | ✅ | launcher-ssr-link=/ssr?name=Dev&width=960&root=ssr-root \| launcher-stream-link=/ssr-stream |
| launcher | click en #launcher-ssr-link navega a /ssr | ✅ | url final=http://localhost:3000/ssr?name=Dev&width=960&root=ssr-root |
| ssr | /ssr width=960: padding 24px, separaciones >=20px, centrado, marcadores de hidratacion | ✅ | padding=24px, gapArriba=25px, gapAbajo=25px, margenes=240/240, hijos=6, data-axiom-id=17, chip=2px 8px 2px 8px, h1="SSR Demo — Axiom renderToString()server rendered" |
| ssr | /ssr width=720: padding 24px, separaciones >=20px, centrado, marcadores de hidratacion | ✅ | padding=24px, gapArriba=25px, gapAbajo=25px, margenes=360/360, hijos=6, data-axiom-id=17, chip=2px 8px 2px 8px, h1="SSR Demo — Axiom renderToString()server rendered" |
| ssr | /ssr-stream: padding 24px, separaciones >=20px, centrado, marcadores de hidratacion | ✅ | padding=24px, gapArriba=25px, gapAbajo=25px, margenes=324/324, hijos=6, data-axiom-id=15, chip=2px 8px 2px 8px, h1="🌀 Streaming SSR Demostreamed" |
| ssr | SSR escapa un nombre hostil (XSS) | ✅ | status=200, htmlSinEscapar=no, aparece escapado=true |
| ssr | SSR hostil no inyecta nodos | ✅ | imagenes inyectadas en #ssr-root=0 |
| higiene | sin errores de pagina | ✅ | pageErrors=0 |
| higiene | sin errores/avisos inesperados en consola | ✅ | mensajes=2, inesperados=0 |
| higiene | sin peticiones fallidas | ✅ | fallidas=0 (favicon 404 preexistente ignorado) |

## Consola y red

- pageErrors: 0
- consola (error/warning): 2
- peticiones fallidas: 0

```
error: [Axiom:prepare] Component#b9f7d6c9 @ Component#b9f7d6c9 {context: Object, err: Error: DX probe: forced render error
    at http://localhost:3000/app.js:1:61279
    at http://loca…}  [durante paso de error esperado]
error: [Axiom:prepare] Component#a6f7f669 @ Component#a6f7f669 {context: Object, err: Error: v0.2.8 envelope: forced error in component render
    at http://localhost:3000/app.js:4:995
…}  [durante paso de error esperado]
```
