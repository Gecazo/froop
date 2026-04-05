import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { Card, CardContent, Stack, Typography } from '@mui/material';

import type { KpiMetricCard as KpiMetricCardModel } from '@/shared/models/dashboard.ts';

interface KpiMetricCardProps {
  metric: KpiMetricCardModel;
}

export const KpiMetricCard = ({ metric }: KpiMetricCardProps) => {
  const isRising = metric.trend === 'up';

  return (
    <Card sx={{ minHeight: 152, bgcolor: 'background.paper' }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>
            {metric.label}
          </Typography>
          <Typography variant="h4" sx={{ fontFamily: '"Space Grotesk", sans-serif' }}>
            {metric.value}
          </Typography>
          <Stack alignItems="center" direction="row" spacing={1}>
            {isRising ? (
              <ArrowUpwardIcon fontSize="small" color="warning" />
            ) : (
              <ArrowDownwardIcon fontSize="small" color="success" />
            )}
            <Typography
              variant="body2"
              sx={{
                color: isRising ? 'warning.main' : 'success.main',
                fontWeight: 700
              }}
            >
              {metric.delta}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};
