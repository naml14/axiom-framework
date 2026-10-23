# Browser DOM comparison (T15 / S16)

Compare the same 500 positioned cards through Axiom updates and native full DOM
replacement, without new dependencies. This is separate from the prepare benchmark
and its golden; neither is modified. The Spanish page displays the complete method
beside persistent results, raw samples, timestamp and browser identity.

## Build and open

From the repository root, with existing dependencies installed:

```sh
bun run demo:build
```

Open `demo/dom-comparison.html` directly using `file://`, or run the existing
`bun run run:demo` server and visit `http://localhost:3000/dom-comparison.html`.
No server or security configuration changes are needed. The parent adds the
relative `./dom-comparison.html` link to the demo landing page.

The build preserves the framework compilation, demo app bundle and static
snapshot steps. It also bundles `benchmarks/dom-comparison-browser.ts` as a
minified classic IIFE and copies the versioned HTML into `demo/`. Both generated
comparison files are ignored by Git. Compilation, missing/empty comparison
artifacts, or HTML copy errors fail the build and its CLI exit status.
The external classic script avoids module restrictions under `file://` and inline
script restrictions under the existing server CSP.

For an isolated source-page build (Git Bash/Bash):

```sh
out=$(mktemp -d)
bun build ./benchmarks/dom-comparison-browser.ts --target browser --format iife --minify --outfile "$out/dom-comparison.js"
cp benchmarks/dom-comparison.html "$out/index.html"
```

Open the temporary `index.html` directly with `file://`, or use this optional
foreground HTTP server from the same shell:

```sh
cd "$out"
bun -e 'Bun.serve({hostname:"127.0.0.1",port:3001,fetch(request){const path=new URL(request.url).pathname; if(path!=="/" && path!=="/dom-comparison.js") return new Response("Not found",{status:404}); return new Response(Bun.file(path==="/"?"index.html":"dom-comparison.js"));}}); console.log("http://127.0.0.1:3001")'
```

Visit the printed URL and click **Ejecutar comparativo**. Stop the server with
Ctrl+C. The system-temp output is disposable; do not commit generated bundles.
The parent owns browser verification, the demo link, and removal of its generated
temporary output.

## What the numbers mean

- Both alternatives start at frame zero, exclude mount, use five warmups and
  thirty measured updates, and alternate which arm runs first. Frame n maps card
  id to slot `(id + 17*n) % 500`. Every step moves every card.
- Each scene is 396 × 350 px. Cards are 16 × 10 px at column × 20, row × 14.
  Axiom uses public `createApp`, `defineComponent`, `h`, `signal` and the public
  scheduler option. Explicit grid placements preserve identity; native rebuilds
  all cards and their wrapper via `replaceChildren`, without diffing.
- The fixed one-line text engine avoids asymmetric canvas/font measurements.
  Both scenes use the same labels, inherited font, colors and box sizing.
- The elapsed median includes scheduling wait, signal dependency work, commit,
  and a host `getBoundingClientRect()` barrier. It excludes subsequent paint.
  Frame latency can dominate: this is not a CPU benchmark or throughput score.
- The existing demo `installDomReadCounter` is reused unchanged, preserving
  instance-only getters, reset semantics and reversible descriptor cleanup.
  Its scope is #axiom clientWidth/clientHeight and window innerWidth/innerHeight,
  including while the native arm runs. It is **not** a universal DOM-access counter.
  Explicit host layout probes are counted separately; no reads are inferred.
- Browser reflow counts are explicitly unavailable: no portable API supplies
  them. Neither getter counts, barriers, nor Axiom's arithmetic layout phase are
  browser reflow counts. A barrier can flush invalidations from both connected
  scenes, so it does not establish per-arm rendering-engine cost.
- No controls need two-way binding: `bind()` is for input/textarea/select signals,
  not result containers or buttons. The static button uses a native event listener.

## Verification and remaining browser evidence

```sh
bun test tests/demo-comparison-build.test.ts tests/dom-comparison.test.ts
bun run typecheck
bun run demo:build
```

The tests import the benchmark, so the repository typecheck includes its TypeScript
transitively despite `benchmarks/` not being a tsconfig include root. Happy-dom pins
500-card content/geometry parity, multiple deterministic permutations, Axiom node
reuse versus full native replacement, awaited commits, getter measurement and
teardown. It cannot establish browser layout or timing performance.

Build tests exercise the public build API in system-temp fixtures, preserve the
original bundle/static snapshot behavior, execute the actual IIFE with happy-dom,
and verify failure propagation through the CLI. This is not real-browser proof.

The parent must check both HTTP and direct generated file access in a real browser
at 1280 px and 480 px:
matching computed rectangles for all 500 cards (relative to each host), matching
text/font, connected visible scenes, complete persistent results after two runs,
30 samples/barriers per arm, and explicit unavailable reflow labels. Keep foreground,
zoom, hardware and window size fixed; retain browser/version and screenshots.
A separate Performance trace can inspect actual Layout events but must not be
presented as a portable automated reflow count. No speedup claim is made here.
