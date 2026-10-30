import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Login from './index';

describe('Login', () => {
  it('renders email and password fields', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });
});
