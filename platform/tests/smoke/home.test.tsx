import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import HomePage from '@/app/page';

test('shows the Thai Health Rider landing heading', () => {
  render(<HomePage />);

  expect(screen.getByRole('heading', { name: 'ระบบจัดการ Health Rider' })).toBeInTheDocument();
});
