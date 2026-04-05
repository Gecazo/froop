import EastOutlinedIcon from '@mui/icons-material/EastOutlined';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import { APP_ROUTES } from '@/config/routes.ts';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle.ts';

import styles from '@/pages/LandingPage.module.scss';

export const LandingPage = () => {
  const navigate = useNavigate();

  useDocumentTitle('Landing');

  return (
    <Box className={styles.page}>
      <Box className={styles.heroPanel}>
        <Typography className={styles.kicker} variant="overline">
          Technical Brutalism / Environmental SaaS
        </Typography>
        <Typography className={styles.title} variant="h1">
          Carbon Intelligence For The Built Environment.
        </Typography>
        <Typography className={styles.description} variant="body1">
          Deploy an enterprise-grade frontend shell for life-cycle analysis, emissions diagnostics,
          and operational decarbonization workflows.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button
            endIcon={<EastOutlinedIcon />}
            onClick={() => {
              navigate(APP_ROUTES.analysis);
            }}
            variant="contained"
            size="large"
          >
            Open Analysis Workspace
          </Button>
          <Button
            onClick={() => {
              navigate(APP_ROUTES.settings);
            }}
            variant="outlined"
            size="large"
          >
            Configure Platform
          </Button>
        </Stack>
      </Box>

      <Box className={styles.metricsGrid}>
        <Box className={styles.metricCard}>
          <Typography variant="overline">Portfolio</Typography>
          <Typography variant="h3">128</Typography>
          <Typography color="text.secondary">Active assets connected</Typography>
        </Box>

        <Box className={styles.metricCard}>
          <Typography variant="overline">Current Intensity</Typography>
          <Typography variant="h3">26.7</Typography>
          <Typography color="text.secondary">kgCO₂e/m² annualized</Typography>
        </Box>

        <Box className={styles.metricCard}>
          <Typography variant="overline">Target Delta</Typography>
          <Typography variant="h3">-42%</Typography>
          <Typography color="text.secondary">By 2032 decarbonization objective</Typography>
        </Box>
      </Box>
    </Box>
  );
};
