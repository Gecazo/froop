import { Box, CircularProgress } from '@mui/material';

export const LoadingState = () => {
  return (
    <Box
      sx={{
        width: '100%',
        minHeight: 220,
        display: 'grid',
        placeItems: 'center'
      }}
    >
      <CircularProgress color="primary" />
    </Box>
  );
};
