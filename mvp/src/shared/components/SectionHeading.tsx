import { Stack, Typography } from '@mui/material';

interface SectionHeadingProps {
  title: string;
  subtitle: string;
}

export const SectionHeading = ({ title, subtitle }: SectionHeadingProps) => {
  return (
    <Stack spacing={0.5}>
      <Typography variant="h3">{title}</Typography>
      <Typography color="text.secondary" variant="body1">
        {subtitle}
      </Typography>
    </Stack>
  );
};
