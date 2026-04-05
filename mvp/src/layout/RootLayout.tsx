import MenuOpenOutlinedIcon from '@mui/icons-material/MenuOpenOutlined';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import NightsStayOutlinedIcon from '@mui/icons-material/NightsStayOutlined';
import TerrainOutlinedIcon from '@mui/icons-material/TerrainOutlined';
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { Outlet, Link as RouterLink, useLocation } from 'react-router-dom';

import { APP_NAVIGATION_ITEMS } from '@/config/navigation.ts';
import { APP_ROUTES } from '@/config/routes.ts';
import { useAppDispatch, useAppSelector } from '@/store/hooks.ts';
import { selectIsDrawerCollapsed, selectThemeMode } from '@/store/selectors.ts';
import { toggleDrawer, toggleThemeMode } from '@/store/uiSlice.ts';

import styles from '@/layout/RootLayout.module.scss';

const DRAWER_WIDTH_EXPANDED = 264;
const DRAWER_WIDTH_COLLAPSED = 84;

const getNavigationIcon = (iconKey: string) => {
  switch (iconKey) {
    case 'analysis':
      return <SpaceDashboardOutlinedIcon />;
    case 'settings':
      return <SettingsOutlinedIcon />;
    default:
      return <TerrainOutlinedIcon />;
  }
};

export const RootLayout = () => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const isDrawerCollapsed = useAppSelector(selectIsDrawerCollapsed);
  const themeMode = useAppSelector(selectThemeMode);

  const drawerWidth = isDrawerCollapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED;

  const handleDrawerToggle = (): void => {
    dispatch(toggleDrawer());
  };

  const handleThemeToggle = (): void => {
    dispatch(toggleThemeMode());
  };

  return (
    <SnackbarProvider
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'right'
      }}
      autoHideDuration={3200}
      maxSnack={4}
    >
      <Box className={styles.shell}>
        <Drawer
          variant="permanent"
          PaperProps={{
            className: styles.drawerPaper,
            sx: {
              width: drawerWidth
            }
          }}
          sx={{
            width: drawerWidth,
            flexShrink: 0
          }}
        >
          <Box className={styles.brandBlock}>
            <Box className={styles.brandMark}>FR</Box>
            {!isDrawerCollapsed && (
              <Stack spacing={0.15}>
                <Typography className={styles.brandTitle} variant="subtitle2">
                  FROOP
                </Typography>
                <Typography className={styles.brandSubtitle} variant="caption">
                  Monolith Client
                </Typography>
              </Stack>
            )}
          </Box>

          <Divider />

          <List disablePadding sx={{ py: 1 }}>
            {APP_NAVIGATION_ITEMS.map((item) => {
              const isActive =
                item.path === APP_ROUTES.landing
                  ? location.pathname === APP_ROUTES.landing
                  : location.pathname.startsWith(item.path);

              return (
                <Tooltip
                  key={item.path}
                  title={isDrawerCollapsed ? item.label : ''}
                  placement="right"
                  disableInteractive
                >
                  <ListItemButton
                    component={RouterLink}
                    to={item.path}
                    selected={isActive}
                    sx={{
                      minHeight: 52,
                      px: isDrawerCollapsed ? 2.2 : 2,
                      justifyContent: isDrawerCollapsed ? 'center' : 'flex-start'
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: isDrawerCollapsed ? 'unset' : 40,
                        color: 'inherit'
                      }}
                    >
                      {getNavigationIcon(item.icon)}
                    </ListItemIcon>
                    {!isDrawerCollapsed && <ListItemText primary={item.label} />}
                  </ListItemButton>
                </Tooltip>
              );
            })}
          </List>
        </Drawer>

        <Box
          className={styles.mainColumn}
          sx={{
            marginLeft: {
              xs: `${DRAWER_WIDTH_COLLAPSED}px`,
              md: `${drawerWidth}px`
            }
          }}
        >
          <Box className={styles.topBar} component="header">
            <Stack alignItems="center" direction="row" spacing={1}>
              <Tooltip title="Toggle Sidebar">
                <IconButton onClick={handleDrawerToggle} size="small" color="inherit">
                  <MenuOpenOutlinedIcon
                    sx={{
                      transform: isDrawerCollapsed ? 'rotate(180deg)' : 'none',
                      transition: 'transform 200ms ease'
                    }}
                  />
                </IconButton>
              </Tooltip>
              <Typography variant="subtitle1" className={styles.topBarTitle}>
                Environmental Building Intelligence Platform
              </Typography>
            </Stack>

            <Tooltip title="Toggle Theme">
              <IconButton onClick={handleThemeToggle} size="small" color="inherit">
                {themeMode === 'dark' ? <WbSunnyOutlinedIcon /> : <NightsStayOutlinedIcon />}
              </IconButton>
            </Tooltip>
          </Box>

          <Box className={styles.contentPane} component="main">
            <Outlet />
          </Box>
        </Box>
      </Box>
    </SnackbarProvider>
  );
};
