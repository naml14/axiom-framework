# Contrato de propiedad del layout

Axiom calcula la geometría en memoria; CSS no recalcula esos números. Declare tamaños,
insets y separaciones en `layout` (o sus helpers). Reserve las clases y `style` para
la presentación. Cliente y SSR comparten coordenadas, pero **no escriben los mismos resets**.

## Qué escribe cada renderer

| Destino | Escrituras actuales |
| --- | --- |
| Host de `createApp` | `position:relative` y altura calculada inline al montar/hidratar; la altura se actualiza en renders posteriores. No fija el ancho del host. |
| Elementos gestionados, cliente | `position:absolute`, `transform:translate(Xpx,Ypx) var(--animation-transform,)`, `width` y `height` en píxeles. No añade `left`, `top`, `box-sizing`, `margin` ni `padding`. |
| Elementos gestionados, SSR | La misma geometría, más `left:0px;top:0px;box-sizing:border-box;margin:0;padding:0` inline. El wrapper con `rootId` no recibe esos estilos. |
| Hijos de portal | Cliente: con `cssManaged:true` (por defecto), CSS controla la geometría; con `false`, la escribe Axiom. SSR omite la geometría de los hijos de portal, incluso si `cssManaged:false`. |

Las coordenadas son relativas al padre directo. `layout.padding` participa en la
aritmética de colocación; no es una promesa de `padding` CSS inline en cliente.
Añadir padding/bordes CSS puede cambiar la caja visible sin actualizar el cálculo.
El cliente depende del CSS de la aplicación para su modelo de caja; no presuponga
que tiene el `border-box` emitido por SSR.

Fuentes: [commitFull y commitHydrate](../src/render/commit.ts),
[renderNode de SSR](../src/ssr.ts), [reflow](../src/render/reflow.ts).
`renderToReadableStream` delega en `renderToString`, así que comparte el contrato SSR.

## Precedencia real

No hay un bloqueo universal que proteja la geometría frente al consumidor:

1. **Montaje completo e inserciones cliente:** primero geometría, después clases y
   atributos saneados, por último props `style`. `attrs.style` reemplaza el atributo
   completo, no lo fusiona: puede borrar la geometría ya escrita.
2. **Actualización incremental:** para cada operación de update, geometría primero,
   después cambios de `style`, clases y atributos. Un nuevo `attrs.style` vuelve a
   reemplazar el atributo completo; retirar un atributo gestionado también lo elimina.
   No todas las propiedades se reescriben si el diff no produce el cambio correspondiente.
3. **Hidratación:** aplica geometría sobre los nodos existentes, sanea los atributos
   y concatena `attrs.style` al estilo existente. No ejecuta el paso de props `style`
   del montaje completo. Los resets que sobreviven proceden del HTML SSR, no de un
   reset equivalente en `applyFrameworkLayout`.
4. **SSR:** escribe geometría/resets y concatena `attrs.style` saneado después;
   declaraciones posteriores de igual prioridad pueden ganar. `renderNode` no
   serializa las props `style` de la Style API.

Una regla normal de hoja pierde ante una declaración inline normal de la misma
propiedad. `!important` puede ganar a ese inline; no significa que los números del
layout se hayan recalculado.

El transform del cliente compone la traslación con `--animation-transform`.
Use esa variable para animar sin sustituir la traslación. Un transform inline ajeno
normal puede ser sobrescrito por una escritura posterior de layout. Si el cliente
detecta un transform inline `!important`, lo respeta; `onTransformConflict` permite
diagnosticar conflictos. Las mutaciones externas posteriores requieren ese hook
para ser inspeccionadas en updates: por defecto Axiom usa su caché de propiedad y
prioridad, no relee continuamente CSSOM.

Fuentes: [applyOps, buildDOMTree, createDOMElement, mergeInlineStyle y applyFrameworkLayout](../src/render/commit.ts).

## Qué puede escribir el consumidor

- **Geometría:** props `layout`, dimensiones responsivas y breakpoints. Los porcentajes
  usan constraints del contenedor; `vw`/`vh` usan el viewport, con fallback a constraints.
- **Presentación:** clases y props admitidas por `SafeStyleProps` (colores, tipografía,
  bordes, etc.). La lista admite padding y transform, pero no `position`, `width` ni
  `height`: «safe» no implica que cada combinación conserve la geometría calculada.
- **Atributos crudos:** `attrs` es un escape hatch saneado, no una segunda API de layout.
  En cliente, desarrollo valida las claves de estilo contra la whitelist; producción
  omite esa validación de claves, pero mantiene el saneamiento de valores. SSR usa su
  propio saneamiento CSS: no asuma paridad de aceptación ni de precedencia.

Fuentes: [Style API y sanitizeInlineStyle](../src/features/style.ts),
[resolución responsiva](../src/render/strategy/responsive.ts), [SSR](../src/ssr.ts).

### Escape hatches deliberados

- **Shell CSS externo:** controle espaciado y overflow fuera del árbol gestionado.
  Si adapta HTML SSR para flujo CSS normal, neutralice explícitamente la geometría
  con reglas acotadas `!important`; para recuperar espaciado, también los resets inline
  de margin/padding. El [shell de streaming](../demo/streaming-route.ts) es un ejemplo
  existente, no el patrón de layout de un árbol Axiom reactivo.
- **Reset manual:** `element.removeAttribute('style')` elimina todo el inline y deja
  actuar a la hoja. Es apropiado para un elemento externo cuya propiedad controla el
  consumidor, como la [muestra de Style API](../demo/ruta-b-showcase.ts). En un nodo
  gestionado borra también la geometría; un commit futuro puede reescribirla y el diff
  no garantiza restaurar todo inmediatamente. No es una API de desmontaje ni de reflow.
- **Portales CSS-managed:** permiten que CSS controle sus hijos en el cliente; consulte
  también el [contrato SSR/hidratación](./SSR-HYDRATION-CONTRACT.md).

## Host menor que la geometría fija (F1)

Un ancho fijo calculado no se encoge por poner `max-width:100%` en el host. Si un
canvas de 800 px entra en 480 px, cambiar solo el clipping no recoloca sus hijos.

- **Ajuste normal:** pase el ancho útil disponible al estado/props que generan el árbol
  y mantenga coherentes el ancho del host y el control que lo muestra. Use porcentajes
  o breakpoints cuando corresponda; reserve el padding externo al medir el espacio útil.
- **Ancho mayor deliberado:** conserve la geometría solicitada y permita scroll horizontal
  en el contenedor externo (`overflow-x:auto`) para alcanzar todo el canvas. No lo
  presente como un ajuste al ancho disponible ni lo oculte con clipping.

El [control del demo](../demo/controls.ts) distingue ambos casos: ajusta al cargar y
redimensionar mediante `fitCanvasWidth`, conserva la elección para restaurarla y permite
pedir más ancho con el slider. Su mínimo de 320 px también puede requerir scroll si el
host ofrece menos espacio. El motor lee constraints del root al montar/redimensionar;
eso no convierte una dimensión fija explícita en una dimensión adaptable.

Fuentes: [constraints de createApp](../src/app.ts),
[dimensiones de reflow](../src/render/reflow.ts), [controles](../demo/controls.ts).
