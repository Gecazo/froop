import { Box, Button, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import { APP_ROUTES } from '@/config/routes.ts';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle.ts';

import styles from '@/pages/NotFoundPage.module.scss';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  useDocumentTitle('Not Found');

  return (
    <Box className={styles.page}>
      <Typography variant="h1">404</Typography>
      <Typography variant="h3">Route Does Not Exist</Typography>
      <Typography color="text.secondary" variant="body1">
        The requested interface path is unavailable in this deployment.
      </Typography>

      <Stack direction="row" spacing={1.5}>
        <Button
          variant="contained"
          onClick={() => {
            navigate(APP_ROUTES.landing);
          }}
        >
          Return Home
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            navigate(APP_ROUTES.analysis);
          }}
        >
          Open Analysis
        </Button>
      </Stack>
    </Box>
  );
};
