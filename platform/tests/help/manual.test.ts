import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manual, manualFor } from '@/help/manual';

describe('user manual', () => {
  it('puts the sections written for a role right after the overview', () => {
    expect(manualFor('rider').map((section) => section.id)).toEqual(['overview', 'login', 'rider', 'pharmacy', 'coordinator', 'reports', 'admin', 'faq']);
    expect(manualFor('pharmacy').map((section) => section.id).slice(2, 5)).toEqual(['pharmacy', 'coordinator', 'reports']);
  });

  it('keeps every section for every role', () => {
    expect(manualFor('auditor')).toHaveLength(manual.length);
  });

  it('closes every bold marker', () => {
    const texts = manual.flatMap((section) => [...section.blocks, ...(section.parts ?? []).flatMap((part) => part.blocks)])
      .flatMap((block) => ('text' in block ? [block.text] : 'items' in block ? block.items : block.rows.flat()));
    for (const text of texts) expect(text.split('**').length % 2, text).toBe(1);
  });
});

describe('manual PDF', () => {
  it('was rebuilt after the last change to the manual (run npm run manual:pdf)', () => {
    const source = createHash('sha256').update(readFileSync('src/help/manual.ts')).digest('hex');
    expect(readFileSync('public/manual/manual-source.sha256', 'utf8').trim()).toBe(source);
    expect(existsSync('public/manual/health-rider-user-manual.pdf')).toBe(true);
  });
});
