import { describe, expect, it } from 'vitest';
import { manual, manualFor } from '@/help/manual';

describe('user manual', () => {
  it('puts the sections written for a role right after the overview', () => {
    expect(manualFor('rider').map((section) => section.id)).toEqual(['overview', 'login', 'rider', 'pharmacy', 'coordinator', 'reports', 'admin', 'faq']);
    expect(manualFor('pharmacy').map((section) => section.id).slice(2, 4)).toEqual(['pharmacy', 'reports']);
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
