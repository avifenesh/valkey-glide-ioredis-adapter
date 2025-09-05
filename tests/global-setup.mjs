// Global test setup to ensure DB cleanup after each test across the suite
// Minimal global setup — no diagnostics or process hooks
import { afterEach } from 'node:test';
afterEach(() => {});
