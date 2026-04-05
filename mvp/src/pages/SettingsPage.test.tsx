import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';

import { SettingsPage } from '@/pages/SettingsPage.tsx';

const renderSettingsPage = (): void => {
  render(
    <ThemeProvider theme={createTheme()}>
      <SnackbarProvider>
        <SettingsPage />
      </SnackbarProvider>
    </ThemeProvider>
  );
};

describe('SettingsPage', () => {
  it('blocks submission when email is invalid', async () => {
    const user = userEvent.setup();

    renderSettingsPage();

    await user.clear(screen.getByLabelText('Alert Email'));
    await user.type(screen.getByLabelText('Alert Email'), 'invalid-email');

    await user.click(screen.getByRole('button', { name: 'Save Configuration' }));

    expect(
      screen.queryByText('Settings updated for Helio Core Developments.')
    ).not.toBeInTheDocument();
  });

  it('submits valid configuration and shows a success toast', async () => {
    const user = userEvent.setup();

    renderSettingsPage();

    await user.click(screen.getByRole('button', { name: 'Save Configuration' }));

    expect(
      await screen.findByText('Settings updated for Helio Core Developments.')
    ).toBeInTheDocument();
  });
});
