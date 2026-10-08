import "@testing-library/jest-dom";

// jsdom 20.x does not implement the Storage interface for
// window.localStorage (it resolves to a bare `{}`), so any test that reads
// auth state via localStorage (e.g. route guards) needs a minimal in-memory
// polyfill. Same category of jsdom gap-filling as the matchMedia shim below.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(window, "localStorage", {
  writable: true,
  value: new MemoryStorage(),
});

// Session state lives in sessionStorage (per-tab); same gap, same polyfill.
Object.defineProperty(window, "sessionStorage", {
  writable: true,
  value: new MemoryStorage(),
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom does not implement ResizeObserver -- @radix-ui/react-checkbox's
// internal useSize hook calls it unconditionally on mount, so any test
// rendering a Checkbox (e.g. AdminProyectos' Chatwoot-acknowledgment
// checkboxes) crashes without this stub. Same category of jsdom
// gap-filling as matchMedia/localStorage above.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: StubResizeObserver,
});

// jsdom implements neither the pointer-capture methods nor
// `scrollIntoView` -- @radix-ui/react-select's popup positioning and item
// selection call these unconditionally, so any test that opens a Select
// and picks an option (e.g. the Proyecto/Usuario filters in
// RegistrosFilterBar) crashes or silently no-ops without these stubs.
// Same category of jsdom gap-filling as the shims above.
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
