import type { SyntheticEvent } from 'react';
import { useMemo, useState } from 'react';

import { Alert, Box, Chip, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';

import { KpiMetricCard } from '@/shared/components/KpiMetricCard.tsx';
import { LoadingState } from '@/shared/components/LoadingState.tsx';
import { SectionHeading } from '@/shared/components/SectionHeading.tsx';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle.ts';
import type {
  AnalysisTabId,
  SitePortfolioRow,
  SystemHealthRow
} from '@/shared/models/dashboard.ts';
import {
  useGetEmissionTrendQuery,
  useGetKpiCardsQuery,
  useGetSitePortfolioQuery,
  useGetSystemsMatrixQuery
} from '@/shared/services/dashboardApi.ts';
import { formatArea, formatEmission } from '@/shared/utils/formatters.ts';

import styles from '@/pages/AnalysisPage.module.scss';

const portfolioColumns: GridColDef<SitePortfolioRow>[] = [
  {
    field: 'id',
    headerName: 'Asset ID',
    width: 120
  },
  {
    field: 'name',
    headerName: 'Asset',
    flex: 1,
    minWidth: 190
  },
  {
    field: 'typology',
    headerName: 'Typology',
    width: 130
  },
  {
    field: 'floorAreaM2',
    headerName: 'Area',
    width: 150,
    valueFormatter: (value) => formatArea(value as number)
  },
  {
    field: 'annualEmissionTco2e',
    headerName: 'Annual Emission',
    width: 170,
    valueFormatter: (value) => formatEmission(value as number)
  },
  {
    field: 'healthStatus',
    headerName: 'Status',
    width: 130,
    renderCell: ({ value }) => {
      const status = String(value);
      const colorByStatus: Record<string, 'success' | 'warning' | 'error'> = {
        Stable: 'success',
        Watch: 'warning',
        Critical: 'error'
      };

      return <Chip label={status} color={colorByStatus[status]} size="small" />;
    }
  }
];

const systemsColumns: GridColDef<SystemHealthRow>[] = [
  {
    field: 'subsystem',
    headerName: 'Subsystem',
    flex: 1,
    minWidth: 210
  },
  {
    field: 'benchmark',
    headerName: 'Benchmark',
    minWidth: 160,
    flex: 1
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 148,
    renderCell: ({ value }) => {
      const status = String(value);
      const colorByStatus: Record<string, 'success' | 'warning' | 'error'> = {
        Aligned: 'success',
        Review: 'warning',
        Intervention: 'error'
      };

      return <Chip label={status} color={colorByStatus[status]} size="small" />;
    }
  },
  {
    field: 'owner',
    headerName: 'Owner',
    minWidth: 170,
    flex: 1
  }
];

const treeToTab = {
  'node-overview': 'overview',
  'node-emissions': 'emissions',
  'node-systems': 'systems'
} as const satisfies Record<string, AnalysisTabId>;

type TreeNodeId = keyof typeof treeToTab;

const tabToTree: Record<AnalysisTabId, TreeNodeId> = {
  overview: 'node-overview',
  emissions: 'node-emissions',
  systems: 'node-systems'
};

const isTreeNodeId = (value: string): value is TreeNodeId => {
  return Object.prototype.hasOwnProperty.call(treeToTab, value);
};

export const AnalysisPage = () => {
  useDocumentTitle('Analysis');

  const [activeTab, setActiveTab] = useState<AnalysisTabId>('overview');

  const {
    data: siteRows = [],
    isLoading: isSiteLoading,
    isError: isSiteError
  } = useGetSitePortfolioQuery();
  const {
    data: kpiCards = [],
    isLoading: isKpiLoading,
    isError: isKpiError
  } = useGetKpiCardsQuery();
  const {
    data: trendRows = [],
    isLoading: isTrendLoading,
    isError: isTrendError
  } = useGetEmissionTrendQuery();
  const {
    data: systemsRows = [],
    isLoading: isSystemsLoading,
    isError: isSystemsError
  } = useGetSystemsMatrixQuery();

  const selectedNode = tabToTree[activeTab];

  const chartSeries = useMemo(
    () => ({
      months: trendRows.map((item) => item.month),
      actual: trendRows.map((item) => item.actual),
      target: trendRows.map((item) => item.target)
    }),
    [trendRows]
  );

  const isLoading = isSiteLoading || isKpiLoading || isTrendLoading || isSystemsLoading;
  const isError = isSiteError || isKpiError || isTrendError || isSystemsError;

  const handleTabChange = (_event: SyntheticEvent, value: AnalysisTabId): void => {
    setActiveTab(value);
  };

  const handleTreeSelection = (
    _event: SyntheticEvent | null,
    selectedItems: string | string[] | null
  ): void => {
    const nextNode = Array.isArray(selectedItems) ? selectedItems[0] : selectedItems;

    if (!nextNode || !isTreeNodeId(nextNode)) {
      return;
    }

    setActiveTab(treeToTab[nextNode]);
  };

  return (
    <Box className={styles.page}>
      <SectionHeading
        title="Portfolio Analysis Console"
        subtitle="Cross-asset operational carbon surveillance and mitigation readiness"
      />

      {isError && (
        <Alert severity="error" variant="outlined">
          An upstream data stream failed to load. Check service connectivity before continuing.
        </Alert>
      )}

      <Box className={styles.workspace}>
        <Paper className={styles.treePanel}>
          <Typography className={styles.panelLabel} variant="overline">
            Analysis Tree
          </Typography>
          <SimpleTreeView selectedItems={selectedNode} onSelectedItemsChange={handleTreeSelection}>
            <TreeItem itemId="node-overview" label="Portfolio Overview" />
            <TreeItem itemId="node-emissions" label="Emission Trend" />
            <TreeItem itemId="node-systems" label="Systems Matrix" />
          </SimpleTreeView>
        </Paper>

        <Paper className={styles.tabPanel}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab value="overview" label="Overview" />
            <Tab value="emissions" label="Emissions" />
            <Tab value="systems" label="Systems" />
          </Tabs>

          {isLoading ? (
            <LoadingState />
          ) : (
            <Box className={styles.tabContent}>
              {activeTab === 'overview' && (
                <Stack spacing={2}>
                  <Box className={styles.kpiGrid}>
                    {kpiCards.map((metric) => (
                      <KpiMetricCard key={metric.id} metric={metric} />
                    ))}
                  </Box>

                  <Box className={styles.gridBlock}>
                    <DataGrid
                      autoHeight
                      rows={siteRows}
                      columns={portfolioColumns}
                      disableRowSelectionOnClick
                      pageSizeOptions={[5, 10]}
                      initialState={{
                        pagination: {
                          paginationModel: {
                            pageSize: 5,
                            page: 0
                          }
                        }
                      }}
                    />
                  </Box>
                </Stack>
              )}

              {activeTab === 'emissions' && (
                <Stack spacing={2}>
                  <Typography variant="body1" color="text.secondary">
                    Monthly trajectory versus decarbonization target curve.
                  </Typography>
                  <Box className={styles.chartBlock}>
                    <LineChart
                      height={340}
                      xAxis={[{ scaleType: 'point', data: chartSeries.months }]}
                      series={[
                        {
                          data: chartSeries.actual,
                          label: 'Actual Emissions',
                          color: '#d7ff2f'
                        },
                        {
                          data: chartSeries.target,
                          label: 'Target Emissions',
                          color: '#44d8ff'
                        }
                      ]}
                    />
                  </Box>
                </Stack>
              )}

              {activeTab === 'systems' && (
                <Box className={styles.gridBlock}>
                  <DataGrid
                    autoHeight
                    rows={systemsRows}
                    columns={systemsColumns}
                    disableRowSelectionOnClick
                    pageSizeOptions={[5]}
                    initialState={{
                      pagination: {
                        paginationModel: {
                          pageSize: 5,
                          page: 0
                        }
                      }
                    }}
                  />
                </Box>
              )}
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
};
