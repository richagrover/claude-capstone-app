import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest.config.ts doesn't enable `globals: true`, so Testing Library's
// own auto-cleanup (which relies on a global `afterEach`) never registers.
// Without this, DOM from one test leaks into the next within the same file.
afterEach(() => {
  cleanup();
});
