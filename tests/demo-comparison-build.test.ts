import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Window } from 'happy-dom'

let dir: string
let api: typeof import('../demo/build.ts')
let calls: Bun.BuildConfig[]
let output: string[]
let errors: string[]
const repository = resolve(import.meta.dir, '..')
const spawn = Bun.spawnSync

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'axiom-demo-comparison-'))
  await mkdir(join(dir, 'demo'))
  await mkdir(join(dir, 'benchmarks'))
  // Execute the public build API with its own ROOT_DIR in disposable storage.
  let source = await readFile(join(repository, 'demo/build.ts'), 'utf8')
  for (const [from, to] of [
    ['../src/build.js', 'src/build.ts'], ['../src/index.js', 'src/index.ts'],
    ['../src/syntax/h.js', 'src/syntax/h.ts'],
  ]) source = source.replace(from!, pathToFileURL(join(repository, to!)).href)
  await writeFile(join(dir, 'demo/build.ts'), source)
  await copyFile(join(repository, 'benchmarks/dom-comparison.html'), join(dir, 'benchmarks/dom-comparison.html'))
  const entryPath = join(repository, 'benchmarks/dom-comparison-browser.ts')
  const entry = await Bun.file(entryPath).exists()
    ? (await readFile(entryPath, 'utf8')).replace('./dom-comparison.js',
      join(repository, 'benchmarks/dom-comparison.ts').replaceAll('\\', '/'))
    : 'throw new Error("Missing browser entry")'
  await writeFile(join(dir, 'benchmarks/dom-comparison-browser.ts'), entry)
  api = await import(pathToFileURL(join(dir, 'demo/build.ts')).href)
  calls = []
  output = []
  errors = []
  spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')))
  spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')))
  const encoder = new TextEncoder()
  spyOn(Bun, 'spawnSync').mockImplementation((() => ({ exitCode: 0,
    stdout: encoder.encode(''), stderr: encoder.encode('') })) as unknown as typeof Bun.spawnSync)
})
afterEach(async () => {
  mock.restore()
  await rm(dir, { recursive: true, force: true })
})

function mockBundles(failure?: 'app' | 'comparison' | 'throw' | 'empty') {
  const realBuild = Bun.build
  spyOn(Bun, 'build').mockImplementation(async options => {
    calls.push(options)
    const comparison = options.entrypoints.some(path => path.endsWith('dom-comparison-browser.ts'))
    if (comparison && failure === 'throw') throw new Error('comparison exception')
    if ((comparison && failure === 'comparison') || (!comparison && failure === 'app')) {
      return { success: false, logs: ['bundle diagnostic'], outputs: [] } as unknown as Bun.BuildOutput
    }
    if (comparison && failure !== 'empty') return realBuild(options)
    if (comparison) return { success: true, logs: [], outputs: [] } as unknown as Bun.BuildOutput
    const path = join(options.outdir!, 'app.js')
    await Bun.write(path, '/* existing demo bundle */')
    return { success: true, logs: [], outputs: [{ path }] } as unknown as Bun.BuildOutput
  })
}

test('doBuild emits an executable classic benchmark and preserves demo bundle options', async () => {
  mockBundles()
  expect(await api.doBuild()).toBe(true)
  expect(calls[0]).toEqual({ entrypoints: [join(dir, 'demo/app.ts')],
    outdir: join(dir, 'demo'), target: 'browser', minify: true })
  const html = await readFile(join(dir, 'demo/dom-comparison.html'), 'utf8')
  const win = new Window({ url: 'file:///demo/dom-comparison.html', settings: {
    enableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true,
  } })
  try {
    win.document.write(html)
    const scripts = [...win.document.querySelectorAll('script')]
    expect(scripts).toHaveLength(1)
    expect(scripts[0]!.getAttribute('src')).toBe('./dom-comparison.js')
    expect(scripts[0]!.getAttribute('type')).not.toBe('module')
    expect(scripts[0]!.textContent.trim()).toBe('')
    const bundle = await readFile(join(dir, 'demo/dom-comparison.js'), 'utf8')
    expect(bundle.length).toBeGreaterThan(0)
    // A classic Script parse and execution must wire the existing page without imports.
    win.eval(bundle)
    const button = win.document.getElementById('run') as unknown as HTMLButtonElement
    button.click()
    expect(button.disabled).toBe(true)
    expect(win.document.querySelector('#results pre')?.textContent).toContain('Ejecutando')
  } finally { await win.happyDOM.close() }
  expect(errors).toEqual([])
})

for (const failure of ['comparison', 'throw', 'empty'] as const) {
  test(`benchmark ${failure} failure returns false and reports diagnostics`, async () => {
    mockBundles(failure)
    expect(await api.doBuild()).toBe(false)
    expect(errors.join('\n')).toContain('[build] Comparison build failed:')
    expect(output.join('\n')).not.toContain('[build] Built demo/dom-comparison')
  })
}

test('existing demo bundling failure still returns false before later build work', async () => {
  mockBundles('app')
  expect(await api.doBuild()).toBe(false)
  expect(calls).toHaveLength(1)
  expect(errors).toEqual(['[build] Demo bundle failed:', 'bundle diagnostic'])
})

test('existing static build still emits its landing page and assets', async () => {
  mockBundles()
  await api.buildStaticDemo()
  const html = await readFile(join(dir, 'demo/static-out/index.html'), 'utf8')
  expect(html).toContain('Axiom Framework Demo')
  expect(html).toContain('This is a statically generated snapshot.')
  expect(await Bun.file(join(dir, 'demo/static-out/assets/app.js')).text()).toContain('existing demo bundle')
  expect(calls).toHaveLength(1)
  expect(calls[0]!.target).toBe('browser')
  expect(calls[0]!.minify).toBe(true)
})

test('demo:build CLI exits nonzero when the comparison bundle fails', async () => {
  const preload = join(dir, 'fail.ts')
  await writeFile(preload, `Bun.spawnSync = (() => ({exitCode:0,stdout:new Uint8Array(),stderr:new Uint8Array()})) as typeof Bun.spawnSync;
Bun.build = async options => ({success:!options.entrypoints.some(p=>p.endsWith('dom-comparison-browser.ts')),logs:['CLI comparison failure'],outputs:[]}) as unknown as Bun.BuildOutput;`)
  const result = spawn([process.execPath, '--preload', preload, join(dir, 'demo/build.ts')], { stdout: 'pipe', stderr: 'pipe' })
  expect(result.exitCode).toBe(1)
  expect(new TextDecoder().decode(result.stderr)).toContain('CLI comparison failure')
})
