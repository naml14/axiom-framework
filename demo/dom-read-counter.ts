export interface DomReadCounter {
  total(): number
  reset(): void
  subscribe(listener: () => void): () => void
  dispose(): void
}

/** Instrument only the engine's root/viewport inputs, never Element.prototype. */
export function installDomReadCounter(root: HTMLElement, win: Window): DomReadCounter {
  let reads = 0
  const restore: (() => void)[] = []
  const listeners = new Set<() => void>()
  const notify = () => { for (const listener of listeners) listener() }
  const reset = () => { reads = 0; notify() }

  function intercept(target: object, key: string): void {
    const own = Object.getOwnPropertyDescriptor(target, key)
    let owner: object | null = target
    let descriptor: PropertyDescriptor | undefined
    while (owner && !descriptor) {
      descriptor = Object.getOwnPropertyDescriptor(owner, key)
      owner = Object.getPrototypeOf(owner) as object | null
    }
    if (!descriptor) throw new Error(`Cannot measure DOM reads: missing ${key}`)
    const original = descriptor
    let value: unknown = original.value
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: original.enumerable,
      get() {
        reads++
        notify()
        return original.get ? original.get.call(target) : value
      },
      ...(original.set ? { set: (next: unknown) => original.set!.call(target, next) }
        : original.writable ? { set: (next: unknown) => { value = next } } : {}),
    })
    restore.push(() => {
      if (own) Object.defineProperty(target, key, own)
      else Reflect.deleteProperty(target, key)
    })
  }

  try {
    intercept(root, 'clientWidth')
    intercept(root, 'clientHeight')
    intercept(win, 'innerWidth')
    intercept(win, 'innerHeight')
  } catch (error) {
    for (const undo of restore.reverse()) undo()
    throw error
  }
  // Capture runs before engine resize listeners and before static input handlers.
  win.addEventListener('resize', reset, true)
  root.ownerDocument.addEventListener('input', reset, true)
  root.ownerDocument.addEventListener('click', reset, true)
  return {
    total: () => reads,
    reset,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      listeners.clear()
      win.removeEventListener('resize', reset, true)
      root.ownerDocument.removeEventListener('input', reset, true)
      root.ownerDocument.removeEventListener('click', reset, true)
      for (const undo of restore.splice(0).reverse()) undo()
    },
  }
}
