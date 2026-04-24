// ============================================================
// src/jsx-runtime.ts — Runtime JSX tree-shakeable (C15)
// Axiom Framework — Nueva Capa de Sintaxis v2.0.0
// ============================================================
//
// Configuración requerida en tsconfig.json:
//   "jsx": "react-jsx",
//   "jsxImportSource": "axiom-framework"
//
// Este módulo es tree-shakeable: si el proyecto usa solo Nivel 1 o 2,
// el bundler puede eliminar este módulo completamente.
// ============================================================

export { h as jsx, h as jsxs } from './syntax/h.js'
export { fragment as Fragment }  from './syntax/h.js'
