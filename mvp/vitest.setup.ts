import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true
  })
});

class ResizeObserverStub {
  public observe(): void {
    return;
  }

  public unobserve(): void {
    return;
  }

  public disconnect(): void {
    return;
  }
}

window.ResizeObserver = ResizeObserverStub;
