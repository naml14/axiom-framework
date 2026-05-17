# Delta for SSR & Hydration Layout

## ADDED Requirements

### Requirement: SSR Inline Style Reset

The system MUST include base reset styles (`box-sizing: border-box`, `margin: 0`, `padding: 0`) in the inline style strings for framework-managed elements during Server-Side Rendering (SSR).

#### Scenario: SSR Output Generation

- GIVEN the framework is rendering a component to an HTML string on the server
- WHEN the inline style string is generated for the component
- THEN the style string MUST include `box-sizing:border-box;margin:0;padding:0;`
- AND native form control borders MUST NOT be modified or reset

### Requirement: Hydration Layout Synchronization

The system MUST apply the framework layout to matched DOM elements during the hydration process to ensure consistency before the first client-side update.

#### Scenario: Hydrating framework elements

- GIVEN the application is hydrating server-rendered HTML on the client
- WHEN `commitHydrate` processes a matched DOM node
- THEN `applyFrameworkLayout` MUST be invoked with the element's layout data and a flag indicating hydration
- AND the element MUST maintain its layout without visual drift or Cumulative Layout Shift (CLS) on first paint