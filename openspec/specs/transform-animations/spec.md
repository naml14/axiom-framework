# Transform Animations Specification

## Purpose

Support CSS transform animations that compose correctly with the Axiom layout engine positioning, and detect conflicts caused by traditional transform overrides.

## Requirements

### Requirement: Composable Transform Layout

The system MUST compose layout transforms and animation transforms predictably using `translate(Xpx, Ypx) var(--animation-transform)` format. Non-animated elements MUST NOT see any change in layout math.

#### Scenario: Element with fill-mode both

- GIVEN an element positioned by Axiom layout
- WHEN a CSS animation with `animation-fill-mode: both` animates `--animation-transform`
- THEN the element MUST render using both Axiom's layout translate and the animation transform

#### Scenario: Element with fill-mode forwards

- GIVEN an element positioned by Axiom layout
- WHEN a CSS animation with `animation-fill-mode: forwards` animates `--animation-transform`
- THEN the Axiom layout translate MUST be preserved after the animation completes

#### Scenario: Non-animated element

- GIVEN an element without transform animations
- WHEN the element is positioned
- THEN the element layout math MUST remain unaffected

### Requirement: Synchronous Conflict Detection

The system MUST provide an `onTransformConflict` hook that fires synchronously when an animation attempts to override Axiom's inline `transform` using a traditional CSS transform.

#### Scenario: Hook execution

- GIVEN an element positioned by Axiom layout
- WHEN a conflicting `transform` animation is detected
- THEN the `onTransformConflict` hook MUST execute synchronously
- AND receive `(element, animationTransform)` as arguments

### Requirement: Important Keyframes Override

The system MUST allow user keyframes to override the composed transform if they use the `!important` flag.

#### Scenario: User keyframe with !important

- GIVEN an element positioned by Axiom layout
- WHEN a user CSS keyframe applies `transform` with `!important`
- THEN the user's `transform` MUST win over Axiom's inline composed transform
