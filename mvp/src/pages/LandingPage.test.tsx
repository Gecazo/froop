import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouterDom from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ROUTES } from '@/config/routes.ts';
import { LandingPage } from '@/pages/LandingPage.tsx';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');

  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

describe('LandingPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('navigates to analysis from CTA', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider theme={createTheme()}>
        <LandingPage />
      </ThemeProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Open Analysis Workspace' }));

    expect(navigateMock).toHaveBeenCalledWith(APP_ROUTES.analysis);
  });
});
