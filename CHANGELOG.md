# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- release-please inserts new entries above this line -->

## [0.9.7](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.9.6...axiom-framework-v0.9.7) (2026-05-15)


### Bug Fixes

* **create-axiom:** load starter CSS in quick start ([#61](https://github.com/naml14/axiom-framework/issues/61)) ([839177b](https://github.com/naml14/axiom-framework/commit/839177b4760a357ea43520c970ed3b04aa5b2799))

## [0.9.6](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.9.5...axiom-framework-v0.9.6) (2026-05-02)


### Features

* **demo:** expose memory pool size in DX metrics and document architecture invariant ([3d5ff3f](https://github.com/naml14/axiom-framework/commit/3d5ff3fe5807e4c96e188b0dc524b58e2b6810aa))
* **memory-pooling:** completar implementación de la piscina de memoria y agregar pruebas de validación ([c82f1e5](https://github.com/naml14/axiom-framework/commit/c82f1e5102d35a185b9df36b25c2950819aca5de))
* **render:** implement Float32Array memory pooling for reflow hot path ([3022527](https://github.com/naml14/axiom-framework/commit/30225273d43ee8f400fa40818b599709622ac83e))
* **render:** memory pooling for layout engine ([2fc8cdd](https://github.com/naml14/axiom-framework/commit/2fc8cdddfe90e486df4f9e5a96910f12fb39b8e5))

## [0.9.5](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.9.4...axiom-framework-v0.9.5) (2026-05-02)


### Bug Fixes

* **dev-server:** address PR56 review findings ([3b8b884](https://github.com/naml14/axiom-framework/commit/3b8b8845ee5e37b9df25be1a166f6812309cad7f))
* **templates:** resolve build config and undefined output type errors in starter server ([9a078c3](https://github.com/naml14/axiom-framework/commit/9a078c334cf8018411acdb166fbbfe10df23d298))

## [0.9.4](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.9.3...axiom-framework-v0.9.4) (2026-05-01)


### Features

* **adoption:** add starter kit, static build, and experimental streaming SSR ([aea9c44](https://github.com/naml14/axiom-framework/commit/aea9c44b8cdc1b065fc91dba152593ab6931cc22))
* **adoption:** add starter kit, static build, and experimental streaming SSR ([dd8c879](https://github.com/naml14/axiom-framework/commit/dd8c8790171b272f77ed0e2ba0187e6de2c379a7))


### Bug Fixes

* **build:** restore library build types for node and Bun wrappers ([6ae4ee1](https://github.com/naml14/axiom-framework/commit/6ae4ee116ea76fb58646aff75c45ff62384599ef))
* **review:** harden static build and starter workflow ([fbde5bf](https://github.com/naml14/axiom-framework/commit/fbde5bf3776e9829e7e8892ec62f64e163605206))

## [0.9.3](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.9.2...axiom-framework-v0.9.3) (2026-05-01)


### Bug Fixes

* **types:** address PR review feedback ([cafc8ff](https://github.com/naml14/axiom-framework/commit/cafc8ff376b1cadd56b7d6639636b27d5673cf64))
* **types:** avoid unused router type test variable ([32bc1be](https://github.com/naml14/axiom-framework/commit/32bc1be22ba8b231e3a550afe5f7356aab51c1cb))

## [0.9.2](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.9.1...axiom-framework-v0.9.2) (2026-04-25)


### Features

* **demo:** add Syntax v2 interactive showcase — h(), Layout DSL, flow control, events, benchmark ([a3e7fbe](https://github.com/naml14/axiom-framework/commit/a3e7fbebe2726b4d13b0f6c046b66e93ee524f62))
* **demo:** showcase JSX syntax ([1b1bf00](https://github.com/naml14/axiom-framework/commit/1b1bf0060109ee908fef73c041f93fc1da7be070))
* **syntax:** add syntax layer v2.0.0 — h(), Layout DSL, control flow, JSX runtime ([e93bfb2](https://github.com/naml14/axiom-framework/commit/e93bfb2baebaa869b91aeb349634a69464b57ead))
* **syntax:** add Syntax v2 authoring layer and demo adoption ([139ebb4](https://github.com/naml14/axiom-framework/commit/139ebb4c51b40ad72041f296116b1782499ac806))
* **syntax:** support JSX component runtime ([d09b0af](https://github.com/naml14/axiom-framework/commit/d09b0af263ceed57a113b5f0ca99f9c823142ec6))


### Bug Fixes

* **ci:** resolve PR workflow failures ([498cc3a](https://github.com/naml14/axiom-framework/commit/498cc3af11a9b11a09674af388d2426cbe5d1803))
* **demo:** align build script with minified pipeline ([f55af54](https://github.com/naml14/axiom-framework/commit/f55af546a053a2ae35c960e8e89b3eaa1ce80f7f))
* **demo:** minify browser bundle ([a783258](https://github.com/naml14/axiom-framework/commit/a78325856113c20cf47c1b77e07ec573ccee5dcb))
* **syntax:** address review findings ([1eee0eb](https://github.com/naml14/axiom-framework/commit/1eee0ebd98b6493da6b6647de21b2c2078e2d2e4))

## [0.9.1](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.9.0...axiom-framework-v0.9.1) (2026-04-16)


### Bug Fixes

* **diff/commit:** detectar cambios de clases CSS en re-render ([244699f](https://github.com/naml14/axiom-framework/commit/244699f9c3427d92b11d5d36335abb1ffde975d8)), closes [#43](https://github.com/naml14/axiom-framework/issues/43)
* **diff:** address PR [#44](https://github.com/naml14/axiom-framework/issues/44) review threads ([a28a8d4](https://github.com/naml14/axiom-framework/commit/a28a8d4f655dad2822d7abb64ca1d700267e3976)), closes [#43](https://github.com/naml14/axiom-framework/issues/43)
* **diff:** detectar cambios de clases CSS en fast path ([a8da6d3](https://github.com/naml14/axiom-framework/commit/a8da6d3ea4f30376d58ab8e2ecba77c769459f9f))

## [0.9.0](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.10...axiom-framework-v0.9.0) (2026-04-16)


### Features

* **api:** add v1 stability contract validation ([332cd89](https://github.com/naml14/axiom-framework/commit/332cd8958589fc4933c91bedb893d7058b55bd65)), closes [#34](https://github.com/naml14/axiom-framework/issues/34)
* **app:** integrate plugin lifecycle runtime hooks ([e2b067c](https://github.com/naml14/axiom-framework/commit/e2b067c5adccaf373ed536e862b01b189d6d314b)), closes [#32](https://github.com/naml14/axiom-framework/issues/32)
* **router:** make router SSR-safe ([b466c13](https://github.com/naml14/axiom-framework/commit/b466c13fc183424d86b1790d87009c3ee9da160a)), closes [#33](https://github.com/naml14/axiom-framework/issues/33)
* **security:** harden attribute validation for CSR/SSR ([a887270](https://github.com/naml14/axiom-framework/commit/a88727006117960acfdcf7c2c3424deed6ef70d1)), closes [#36](https://github.com/naml14/axiom-framework/issues/36)


### Bug Fixes

* **codeql:** remove unused path import ([b6ab23f](https://github.com/naml14/axiom-framework/commit/b6ab23fc7e50b4f54ba3ff6d49e4be066fcd93e3)), closes [#41](https://github.com/naml14/axiom-framework/issues/41)
* **docs:** correct table formatting in API stability contract ([747a08e](https://github.com/naml14/axiom-framework/commit/747a08e03e0b9bed5e5688190affb070e886ee53))
* **hydration:** harden attrs sanitization and align docs ([00f4a2f](https://github.com/naml14/axiom-framework/commit/00f4a2fb2e5bcb9ed7a4c441c9f20ec8e6e510a4)), closes [#39](https://github.com/naml14/axiom-framework/issues/39)
* **prepare:** isolate index state per invocation ([cb14cac](https://github.com/naml14/axiom-framework/commit/cb14cac9ca71413dabf040ce0795c5185b42dbca)), closes [#31](https://github.com/naml14/axiom-framework/issues/31)
* **review:** address codeql and gemini feedback ([df2c04e](https://github.com/naml14/axiom-framework/commit/df2c04ecd25100dab5b88416ce3d9dc46deaddf6)), closes [#41](https://github.com/naml14/axiom-framework/issues/41)
* **review:** address critical path and API issues in validate-api-stability.ts ([67bddf8](https://github.com/naml14/axiom-framework/commit/67bddf8f132e3a8fc23d29fef4ec8935da3a679b))
* **review:** address new sourcery-ai round-2 comments ([70033bb](https://github.com/naml14/axiom-framework/commit/70033bb9c20cfa923a0f9a06abdb0b5706169ebb)), closes [#41](https://github.com/naml14/axiom-framework/issues/41)
* **review:** finalize stability script and security wording ([ea11a23](https://github.com/naml14/axiom-framework/commit/ea11a23602d916ed3f20c951be12dc653abb7ef3)), closes [#41](https://github.com/naml14/axiom-framework/issues/41)
* **scheduler:** make setScheduler functional with global scheduler state ([5869a39](https://github.com/naml14/axiom-framework/commit/5869a3911426aaf85157fe46038dd78b49c7f547)), closes [#37](https://github.com/naml14/axiom-framework/issues/37)
* **scripts:** update import paths to use node: prefix ([747a08e](https://github.com/naml14/axiom-framework/commit/747a08e03e0b9bed5e5688190affb070e886ee53))
* **tsconfig:** include scripts directory in TypeScript compilation ([747a08e](https://github.com/naml14/axiom-framework/commit/747a08e03e0b9bed5e5688190affb070e886ee53))


### Performance Improvements

* **diff:** optimize index lookups in fullDiff ([3a3b7fa](https://github.com/naml14/axiom-framework/commit/3a3b7faba5e4b8ba7cbe3b39a2b8dc0dbf6616ea)), closes [#40](https://github.com/naml14/axiom-framework/issues/40)


### Miscellaneous Chores

* **release:** prepare 0.9.0 stabilization ([b87ccc2](https://github.com/naml14/axiom-framework/commit/b87ccc25e0558423d0b38577f80e9e4d9c0e4ba8))

## [0.2.10](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.9...axiom-framework-v0.2.10) (2026-04-15)


### Features

* **portal:** add cssManaged flag for portal children layout management ([3a3f5b3](https://github.com/naml14/axiom-framework/commit/3a3f5b3505b854003793d0466bcd4a73db87e1b3))


### Bug Fixes

* address valid bot review findings ([17b8ca6](https://github.com/naml14/axiom-framework/commit/17b8ca6c392bfce024b06c3830891b5341e052b1))

## [0.2.9](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.8...axiom-framework-v0.2.9) (2026-04-15)


### Features

* **demo:** actualizar la demostración de Axiom — agregar soporte para demo estático y SSR, mejorar la interfaz y la documentación ([fbcebdb](https://github.com/naml14/axiom-framework/commit/fbcebdbba24e593568ac28d9f5e5e8713e33eeab))
* **ruta-b:** agregar demostración de Ruta B — grid, responsive, estilo, animación, plugins y manejo de errores ([89ee25b](https://github.com/naml14/axiom-framework/commit/89ee25b71e4d56d6f8665696754e4d6c5ec49d0b))
* **ruta-b:** completar integración Ruta B en estado actual ([49e47c9](https://github.com/naml14/axiom-framework/commit/49e47c903a99f0f59dc9e4f990a91c9de7c06465))
* **ruta-b:** complete all 6 phases — responsive, grid, style, motion, plugins, hardening ([49f61ef](https://github.com/naml14/axiom-framework/commit/49f61eff57ee876ef3884bbe27c9f57e460da806))


### Bug Fixes

* **review:** resolve copilot and gemini findings for PR [#26](https://github.com/naml14/axiom-framework/issues/26) ([32ea4c5](https://github.com/naml14/axiom-framework/commit/32ea4c56ef3a1bf1c1d5bc98733332ad61edc3a3))

## [0.2.8](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.7...axiom-framework-v0.2.8) (2026-04-15)


### Features

* **errors:** P0-B — error envelope with phase/component context ([593aac8](https://github.com/naml14/axiom-framework/commit/593aac8822bcb2687b61f11e4599bdeceada2287))


### Bug Fixes

* **ci:** restore test green and align docs/api ([6d71265](https://github.com/naml14/axiom-framework/commit/6d7126580ac57dfa9739fbb4a73cc74107be643c))


### Performance Improvements

* **benchmark:** P0-C — per-phase thresholds and hydration baseline ([02dbf4e](https://github.com/naml14/axiom-framework/commit/02dbf4e8f0645a5273f82edef43efbcff82b72ac))

## [0.2.7](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.6...axiom-framework-v0.2.7) (2026-04-13)


### Features

* actualizar importaciones a la carpeta src y mejorar la detección del entorno de desarrollo ([1ad555e](https://github.com/naml14/axiom-framework/commit/1ad555e4d032914ce336159646189545abe3bd29))
* actualizar importaciones a TypeScript y mejorar la gestión de módulos en el demo ([f2557a9](https://github.com/naml14/axiom-framework/commit/f2557a9f5ed95ca0ea1fe41bbe93ee5a2686cbda))
* agregar panel de demostración DX para capacidades de Sprint 6 y mejorar la gestión de errores y perfilado ([881c854](https://github.com/naml14/axiom-framework/commit/881c85437103a96a64a9f377de3279dabcfabcc7))
* **demo:** add configurable SSR server demo route ([fdf7197](https://github.com/naml14/axiom-framework/commit/fdf71979dee9a01225521f5a1bccde885d02a3a8))
* **hydration:** wire commitHydrate into createApp via hydrate option ([323c9c5](https://github.com/naml14/axiom-framework/commit/323c9c574256636eca289f15cbfc94d211162c22))
* implement render scheduler and add portal demonstration components ([45ebbe2](https://github.com/naml14/axiom-framework/commit/45ebbe20527039eafaaba78aa15445aff7faaa1c))
* mejorar prueba de scheduler para reflejar el comportamiento de agrupamiento de llamadas ([abd27a2](https://github.com/naml14/axiom-framework/commit/abd27a2160fc9e30a5e343d54aff11c4d2e30530))
* Sprint 6 DX v0.2.7 — Developer Experience Capabilities ([7c77fe0](https://github.com/naml14/axiom-framework/commit/7c77fe06470d6eab1fda83b07a1b553e8acb2c06))
* Sprint 6 DX v0.2.7 — Profiling, Dev Hook, Error Context, Hot Reload Recovery ([28c6048](https://github.com/naml14/axiom-framework/commit/28c6048c7a3368cd6eec807e375fa4781b650a0e)), closes [#19](https://github.com/naml14/axiom-framework/issues/19)
* **ssr,hydration:** consolidate stash fixes for Sprint 6 ([2f92eb6](https://github.com/naml14/axiom-framework/commit/2f92eb650a72993e2b35cb51b9be1bf2281a98d5))
* **ssr:** add SSR page handler and build utilities for demo server ([2f8db26](https://github.com/naml14/axiom-framework/commit/2f8db26a4750cfb5edaff3eee71a4388fa3a7759))
* **ssr:** set default body styles for SSR pages to improve rendering ([6c34bc6](https://github.com/naml14/axiom-framework/commit/6c34bc69160c4556d466e078918d3dfc358df15c))


### Bug Fixes

* actualizar la importación del módulo SSR a la carpeta src ([64a0450](https://github.com/naml14/axiom-framework/commit/64a04503355cc1245c67129ea514668b048c9715))
* handle potential undefined values in layout height calculations and improve type safety in tests ([7f8b7b4](https://github.com/naml14/axiom-framework/commit/7f8b7b4618396222f104d51681d6957eb3b28b9c))
* **ssr:** restore HTML contract for tests while keeping meta/bodyStyle improvements ([1aab998](https://github.com/naml14/axiom-framework/commit/1aab9983ab272de52d68686d18139ea0c0c6db3a))

## [0.2.6](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.5...axiom-framework-v0.2.6) (2026-04-12)


### Features

* **ssr:** add renderToString public API ([47fdc4d](https://github.com/naml14/axiom-framework/commit/47fdc4d08c14571acca86cf065c2cb14c69cffba))
* **ssr:** add renderToString public API ([d6b369d](https://github.com/naml14/axiom-framework/commit/d6b369d7b9d2ea8906e91826212c8552bd29a61c))


### Bug Fixes

* **ssr:** address PR [#17](https://github.com/naml14/axiom-framework/issues/17) review comments ([4b4b9db](https://github.com/naml14/axiom-framework/commit/4b4b9db1373877a9ccf4b9744dc5a1617bfe93b1))

## [0.2.5](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.4...axiom-framework-v0.2.5) (2026-04-11)


### Features

* **router:** add declarative SPA routing with async components ([2d888ab](https://github.com/naml14/axiom-framework/commit/2d888ab4d930ed3d3d68903f5ce58fb7edd3cc36))
* **router:** declarative SPA routing with async components ([7c8dac7](https://github.com/naml14/axiom-framework/commit/7c8dac7b7a9762545413c60c96905318c56c3cf3))


### Bug Fixes

* **router:** address security review findings ([c5dea3e](https://github.com/naml14/axiom-framework/commit/c5dea3eedf7729716964cc4954166153e1ddf55a))
* **router:** avoid dynamic property writes in URL parsing ([650a5e0](https://github.com/naml14/axiom-framework/commit/650a5e0c43f6c484c5f5d8efc65cbb04c8a4a30a))
* **router:** harden URL parsing and review feedback ([8e5cb61](https://github.com/naml14/axiom-framework/commit/8e5cb6183f6a4199e54179b8b957a1d705b348cc))
* **router:** tighten key guards for CodeQL ([cf4ca24](https://github.com/naml14/axiom-framework/commit/cf4ca24678417d2c830cef17ae074a87f35f5a11))

## [0.2.4](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.3...axiom-framework-v0.2.4) (2026-04-11)


### Features

* **portal:** add createPortal for rendering outside the component tree ([8ad5896](https://github.com/naml14/axiom-framework/commit/8ad58969bc2053e5604266cf08608841395a67af))
* **portal:** add createPortal for rendering outside the component tree ([ee397b5](https://github.com/naml14/axiom-framework/commit/ee397b5b456a45696a6153e2a0d0de7089f4b514))


### Bug Fixes

* **portal:** address PR review findings — cleanup safety, layout, and diff routing ([9d25415](https://github.com/naml14/axiom-framework/commit/9d25415cd5318d846679d5eccd44b5a07b8df2f6))

## [0.2.3](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.2...axiom-framework-v0.2.3) (2026-04-05)


### Features

* **context,forms:** add reactive context and forms modules for v0.3.0 ([a8b9060](https://github.com/naml14/axiom-framework/commit/a8b9060a2fb2c74a79827cfa3aa3b661fc3ff70d))
* **context,forms:** add reactive context and forms modules for v0.3.0 ([d619b1f](https://github.com/naml14/axiom-framework/commit/d619b1fe60237ebde747dc90bdf75408decae0e4)), closes [#4](https://github.com/naml14/axiom-framework/issues/4)


### Bug Fixes

* **forms,context:** address PR review findings from Sourcery AI and Gemini ([e89413e](https://github.com/naml14/axiom-framework/commit/e89413e6522d01ed435e9ef28946575e6ab9398b))
* **tests:** use GlobalWindow and mount select to body to fix happy-dom select tests ([599782d](https://github.com/naml14/axiom-framework/commit/599782d37d2fb3abd7f759aeeef7310198e8c06a))

## [0.2.2](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.1...axiom-framework-v0.2.2) (2026-04-04)


### Features

* add declarative events and native flexWrap support ([d0de77a](https://github.com/naml14/axiom-framework/commit/d0de77a9158db9a6515e059f943bc96b5db97b75))


### Bug Fixes

* **ci:** configure npm auth via registry-url and opt into Node.js 24 for release-please ([304e027](https://github.com/naml14/axiom-framework/commit/304e027c09b694b145ceb27bfac518ff04313d20))
* **ci:** use registries input instead of deprecated registry-url in setup-bun ([717b6ca](https://github.com/naml14/axiom-framework/commit/717b6ca139cd443ccf74fea6831a1c08b9c25adc))

## [0.2.1](https://github.com/naml14/axiom-framework/compare/axiom-framework-v0.2.0...axiom-framework-v0.2.1) (2026-04-04)


### Features

* add masonry layout demo application with reactive container resizing ([6ffe596](https://github.com/naml14/axiom-framework/commit/6ffe596aaf19ad9e1cc0a333b8b7f194cff2ce87))
* implement core layout engine with flexbox support and reflow logic ([6da6aa3](https://github.com/naml14/axiom-framework/commit/6da6aa3ec1ef2ace38c12378250bf854c47e487c))
* implement demo application with masonry layout and performance metrics tracking ([7b4270e](https://github.com/naml14/axiom-framework/commit/7b4270e91d989c465760389c83a7577c5eec2b96))
* prepare v0.2.0 for public release ([30ed247](https://github.com/naml14/axiom-framework/commit/30ed24725f16d0efaa13106c7b3df14b6e582d01))
* refactor app structure by modularizing components, controls, and layout logic ([cc6bdfc](https://github.com/naml14/axiom-framework/commit/cc6bdfc9c89d06b3c6afe4e9c058fce6f65b2426))
* **tests:** add comprehensive test suite for components, diffing, reflow, signals, and scheduler ([e52a564](https://github.com/naml14/axiom-framework/commit/e52a564149d30bb1d925f3f5281fc3c8a52cfd36))
* update version to 0.1.0 in package.json ([76c4bf1](https://github.com/naml14/axiom-framework/commit/76c4bf108f17bc2e68d83cab1cb1d2f6f73fb44b))


### Bug Fixes

* resolve typecheck errors in CI — re-export DOMOperation and narrow ComponentNode union ([4ea6dc6](https://github.com/naml14/axiom-framework/commit/4ea6dc63e4a1410b43f2c1064d97451f99d221d7))
* resolve TypeScript compilation errors ([6bbfca3](https://github.com/naml14/axiom-framework/commit/6bbfca3aea9e882919f5fe22e77f574429b944e9))

## [0.1.1] - 2026-03-15

### Added in 0.1.1

- Masonry demo with tag cloud, hero card, and multi-column layout
- Demo controls: container width slider, item count slider
- Live metrics panel (prepare/reflow/commit timings)

## [0.1.0] - 2026-03-01

### Added in 0.1.0

- **Phase 1 — Signals**: `signal()`, `computed()`, `effect()` with dependency tracking, circular detection, cleanup functions
- **Phase 2 — Reflow Engine**: `prepare()`, `reflow()` with flex layout (row/column, gap, justify, align, padding) and fast path for simple block layouts
- **Phase 3 — Commit Engine**: `commitFull()`, `applyOps()`, `fullDiff()`, `fastDiff()` with key-based reconciliation
- **Phase 4 — App**: `createApp()`, `mount()`, `unmount()`, `getMetrics()`
- **Scheduler**: rAF batching with generation invalidation, injectable for testing
- **Brand types**: Opaque `PreparedComponent` handle — consumers cannot accidentally access internal structure
- **Float32Array** layout buffers — zero unnecessary allocations in the hot path
- **146 unit + integration tests**
