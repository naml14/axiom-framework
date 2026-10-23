# Regla de revisión visual

Antes de reportar un hallazgo visual, contrástelo con **el código fuente y una
segunda primitiva de medición**. Una captura o un contador aislado es una pista,
no un defecto confirmado.

## Comprobación mínima

1. Registre URL, viewport, estado de controles y pasos de reproducción.
2. Consulte el código que calcula/escribe la propiedad y las reglas CSS que compiten
   con ella. Distinga cliente, SSR e hidratación; use el
   [contrato de layout](../docs/LAYOUT_CONTRACT.md) para orientar la lectura, no para
   sustituir la comprobación del código actual.
3. Mida el síntoma y contrástelo con una segunda primitiva distinta: por ejemplo,
   `getComputedStyle` para padding declarado frente a distancias entre rectángulos
   para el inset visible; o `scrollWidth/clientWidth` frente a rectángulos de los hijos
   para un desborde. Repetir la misma consulta no es una segunda medición.
4. Compare ambas evidencias con el comportamiento esperado antes de clasificarlo.
   Distinga un canvas fijo con scroll horizontal deliberado de contenido inaccesible
   por clipping; no infiera un solapamiento solo por el tamaño de la caja de texto.

El reporte incluye las dos mediciones, las referencias `ruta:línea` del código
contrastado y los pasos reproducibles. Si las evidencias discrepan, registre la
incertidumbre y continúe el diagnóstico en vez de presentar el hallazgo como confirmado.
