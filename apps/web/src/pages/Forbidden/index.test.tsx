import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Forbidden from './index';

describe('Forbidden', () => {
  it('renders permission guidance and exit actions', () => {
    render(
      <MemoryRouter>
        <Forbidden />
      </MemoryRouter>,
    );

    expect(screen.getByText('没有访问权限')).toBeInTheDocument();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
    expect(screen.getByText('返回上一页')).toBeInTheDocument();
  });
});
