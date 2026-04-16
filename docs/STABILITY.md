# API Stability Contract

Version: 1.0.0
Last Updated: 2026-04-16

## Public Surface

This contract applies to exports from src/index.ts and src/testing.ts.

For v1.0.0 kickoff, untagged public exports are treated as stable since v1.0.0.

## Stable APIs (95)

| Export | Module | Since |
|--------|--------|-------|
| signal | ./reactivity/signals | v1.0.0 |
| computed | ./reactivity/signals | v1.0.0 |
| effect | ./reactivity/signals | v1.0.0 |
| defineComponent | ./render/component | v1.0.0 |
| createPortal | ./features/portal | v1.0.0 |
| createApp | ./app | v1.0.0 |
| App | ./app | v1.0.0 |
| AppOptions | ./app | v1.0.0 |
| AppErrorContext | ./app | v1.0.0 |
| AppErrorPhase | ./app | v1.0.0 |
| RenderMetrics | ./app | v1.0.0 |
| renderToString | ./ssr | v1.0.0 |
| commitHydrate | ./render/commit | v1.0.0 |
| SSRMetadata | ./ssr | v1.0.0 |
| SSRRenderOptions | ./ssr | v1.0.0 |
| HydrationOptions | ./core/types | v1.0.0 |
| HydrationResult | ./core/types | v1.0.0 |
| createRouter | ./router | v1.0.0 |
| defineAsyncComponent | ./router | v1.0.0 |
| Route | ./router | v1.0.0 |
| RouteState | ./router | v1.0.0 |
| Router | ./router | v1.0.0 |
| prepare | ./render/prepare | v1.0.0 |
| reflow | ./render/reflow | v1.0.0 |
| resolveResponsiveLayout | ./render/strategy/responsive | v1.0.0 |
| resolveLayoutDimension | ./render/strategy/responsive | v1.0.0 |
| matchesBreakpoint | ./render/strategy/responsive | v1.0.0 |
| ResolvedLayoutProps | ./render/strategy/responsive | v1.0.0 |
| measureGrid | ./render/engines/grid | v1.0.0 |
| SAFE_STYLE_KEYS | ./features/style | v1.0.0 |
| validateStyleProps | ./features/style | v1.0.0 |
| resolveStyleTokens | ./features/style | v1.0.0 |
| createTheme | ./features/style | v1.0.0 |
| applyStyleToElement | ./features/style | v1.0.0 |
| SafeStyleKey | ./features/style | v1.0.0 |
| SafeStyleProps | ./features/style | v1.0.0 |
| ThemeTokens | ./features/style | v1.0.0 |
| Theme | ./features/style | v1.0.0 |
| createTransition | ./features/animation | v1.0.0 |
| createAnimationState | ./features/animation | v1.0.0 |
| scheduleTransition | ./features/animation | v1.0.0 |
| cancelTransition | ./features/animation | v1.0.0 |
| applyImmediately | ./features/animation | v1.0.0 |
| getTransitionProgress | ./features/animation | v1.0.0 |
| isTransitioning | ./features/animation | v1.0.0 |
| TransitionDefinition | ./features/animation | v1.0.0 |
| AnimationState | ./features/animation | v1.0.0 |
| TransitionProperty | ./features/animation | v1.0.0 |
| createPlugin | ./features/plugin | v1.0.0 |
| registerPlugin | ./features/plugin | v1.0.0 |
| getRegisteredPlugins | ./features/plugin | v1.0.0 |
| clearPlugins | ./features/plugin | v1.0.0 |
| applyPluginHook | ./features/plugin | v1.0.0 |
| AxiomPlugin | ./features/plugin | v1.0.0 |
| PluginContext | ./features/plugin | v1.0.0 |
| PluginHook | ./features/plugin | v1.0.0 |
| createContext | ./features/context | v1.0.0 |
| withContext | ./features/context | v1.0.0 |
| useContext | ./features/context | v1.0.0 |
| createStore | ./features/context | v1.0.0 |
| provideStore | ./features/context | v1.0.0 |
| injectStore | ./features/context | v1.0.0 |
| Context | ./features/context | v1.0.0 |
| StoreInstance | ./features/context | v1.0.0 |
| bind | ./features/forms | v1.0.0 |
| validate | ./features/forms | v1.0.0 |
| required | ./features/forms | v1.0.0 |
| minLength | ./features/forms | v1.0.0 |
| maxLength | ./features/forms | v1.0.0 |
| pattern | ./features/forms | v1.0.0 |
| ValidationRule | ./features/forms | v1.0.0 |
| ValidationResult | ./features/forms | v1.0.0 |
| ValidateOptions | ./features/forms | v1.0.0 |
| SyncRule | ./features/forms | v1.0.0 |
| AsyncRule | ./features/forms | v1.0.0 |
| AxiomDevHook | ./core/types | v1.0.0 |
| AxiomDevMetrics | ./core/types | v1.0.0 |
| AxiomDevProfilingMetadata | ./core/types | v1.0.0 |
| Signal | ./core/types | v1.0.0 |
| ComputedSignal | ./core/types | v1.0.0 |
| ComponentDefinition | ./core/types | v1.0.0 |
| ComponentNode | ./core/types | v1.0.0 |
| ElementNode | ./core/types | v1.0.0 |
| TextNode | ./core/types | v1.0.0 |
| FragmentNode | ./core/types | v1.0.0 |
| PortalNode | ./core/types | v1.0.0 |
| PreparedComponent | ./core/types | v1.0.0 |
| LayoutResult | ./core/types | v1.0.0 |
| LayoutConstraints | ./core/types | v1.0.0 |
| LayoutProps | ./core/types | v1.0.0 |
| ProfileEvent | ./core/types | v1.0.0 |
| ProfileSubscriber | ./core/types | v1.0.0 |
| RenderResult | ./testing.ts | v1.0.0 |
| render | ./testing.ts | v1.0.0 |
| fireEvent | ./testing.ts | v1.0.0 |

## Beta APIs (0)

| Export | Module | Since |
|--------|--------|-------|
| (none) | - | - |

## Experimental APIs (0)

| Export | Module |
|--------|--------|
| (none) | - |

## Enforcement

- Run: bun run validate:api
- CI should fail on validation errors.
