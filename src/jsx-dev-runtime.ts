// ============================================================
// src/jsx-dev-runtime.ts — Runtime JSX para modo desarrollo
// ============================================================
//
// Incluye validaciones extra via hDev().
// En producción, el bundler usará jsx-runtime.ts directamente.
// ============================================================

export { hDev as jsx, hDev as jsxs } from './syntax/h.dev.js'
export { fragment as Fragment }       from './syntax/h.js'
