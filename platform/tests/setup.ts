import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Route tests run without licensing whatever key the build carries; tests/api/admin-license.test.ts sets its own.
vi.mock('@/license/public-key', () => ({ licensePublicKey: '' }));
