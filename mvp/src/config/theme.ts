import { createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

export const createAppTheme = (mode: PaletteMode) => {
  const isDarkMode = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: '#d7ff2f',
        contrastText: '#0c0f12'
      },
      secondary: {
        main: '#44d8ff',
        contrastText: '#071117'
      },
      background: {
        default: isDarkMode ? '#0e1013' : '#f2f3f4',
        paper: isDarkMode ? '#161b20' : '#fbfcfd'
      },
      divider: isDarkMode ? '#323b44' : '#adb4bc',
      text: {
        primary: isDarkMode ? '#f8fafb' : '#0e141a',
        secondary: isDarkMode ? '#b8c0c9' : '#2b3641'
      }
    },
    shape: {
      borderRadius: 0
    },
    typography: {
      fontFamily: 'Inter, sans-serif',
      h1: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        textTransform: 'uppercase'
      },
      h2: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        textTransform: 'uppercase'
      },
      h3: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        letterSpacing: '-0.01em'
      },
      button: {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase'
      }
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            border: '1px solid',
            borderColor: isDarkMode ? '#303841' : '#9aa3ad',
            boxShadow: 'none'
          }
        }
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            borderWidth: '1px',
            borderStyle: 'solid'
          },
          containedPrimary: {
            borderColor: '#d7ff2f',
            '&:hover': {
              borderColor: '#d7ff2f'
            }
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 0
          }
        }
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined'
        }
      }
    }
  });
};
