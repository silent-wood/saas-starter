import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import NotFound from './index';

describe('NotFound', () => {
  it('renders 404 guidance and a way back home', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByText('页面不存在')).toBeInTheDocument();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });
});
