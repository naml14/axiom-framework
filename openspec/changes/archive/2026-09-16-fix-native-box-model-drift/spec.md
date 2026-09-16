# Spec: Fix Native Box-Model Drift

## Requirements

### R1: SSR includes box-model resets
SSR output for framework-managed elements includes `box-sizing:border-box;margin:0;padding:0;` in the inline style.

### R2: commitHydrate applies layout styles
`commitHydrate` calls `applyFrameworkLayout` for each element node, even if SSR already injected styles.

### R3: User styles merged, not replaced
If an element node has `attrs.style`, it is appended to the existing style, not used to replace it.

### R4: Hydration test not a false positive
A test exists that builds DOM manually without SSR styles, then verifies `commitHydrate` applies `position` style.
