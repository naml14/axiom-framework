# ssr-hydration Specification

## Purpose

Define the transform string contract and hook behavior during Server-Side Rendering (SSR) and subsequent hydration to ensure animation consistency.

## Requirements

### Requirement: Transform String Contract

During SSR and hydration, the system MUST emit the identical `translate(Xpx,Ypx) var(--animation-transform)` string to preserve layout and animation slots.
Tests MUST assert this exact string contract using happy-dom, avoiding parsed CSS values.

#### Scenario: SSR to Hydration preservation

- GIVEN an application rendered on the server with layout transforms
- WHEN the client hydrates the server-rendered markup
- THEN the transform string MUST remain `translate(Xpx,Ypx) var(--animation-transform)`
- AND the layout and animation slots MUST be preserved

### Requirement: Transform Conflict Hook

The `onTransformConflict` hook MUST fire correctly when an animation update conflicts with an existing transform during a hydration update cycle.

#### Scenario: Hydration update causes transform conflict

- GIVEN a hydrated application
- WHEN an update cycle attempts to apply an animation that clobbers the existing transform
- THEN the `onTransformConflict` hook MUST fire to handle the collision