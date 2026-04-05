import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { Component } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error): void {
    console.error('Application boundary caught an error:', error);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  public render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          p: 4,
          bgcolor: 'background.default'
        }}
      >
        <Stack spacing={2} sx={{ maxWidth: 520 }}>
          <Typography variant="h2">Runtime Fault</Typography>
          <Alert severity="error" variant="outlined">
            The application shell encountered an unrecoverable error.
          </Alert>
          <Button onClick={this.handleReload} variant="contained" color="primary">
            Reload Shell
          </Button>
        </Stack>
      </Box>
    );
  }
}
