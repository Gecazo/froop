import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';

import type {
  EmissionTrendPoint,
  KpiMetricCard,
  SitePortfolioRow,
  SystemHealthRow
} from '@/shared/models/dashboard.ts';

const mockSitePortfolio: SitePortfolioRow[] = [
  {
    id: 'BLD-101',
    name: 'Vanguard Tower',
    typology: 'Mixed-use',
    floorAreaM2: 31800,
    annualEmissionTco2e: 4120.5,
    healthStatus: 'Watch'
  },
  {
    id: 'BLD-104',
    name: 'Aster Logistics Hub',
    typology: 'Industrial',
    floorAreaM2: 54320,
    annualEmissionTco2e: 6812.2,
    healthStatus: 'Critical'
  },
  {
    id: 'BLD-117',
    name: 'Northbank Campus',
    typology: 'Office',
    floorAreaM2: 22740,
    annualEmissionTco2e: 2122.9,
    healthStatus: 'Stable'
  },
  {
    id: 'BLD-143',
    name: 'Riverforge Apartments',
    typology: 'Residential',
    floorAreaM2: 18950,
    annualEmissionTco2e: 1840.4,
    healthStatus: 'Stable'
  }
];

const mockKpiCards: KpiMetricCard[] = [
  {
    id: 'operational',
    label: 'Operational Carbon',
    value: '14.9k tCO₂e',
    delta: '-6.4% QoQ',
    trend: 'down'
  },
  {
    id: 'embodied',
    label: 'Embodied Carbon',
    value: '8.3k tCO₂e',
    delta: '+2.1% QoQ',
    trend: 'up'
  },
  {
    id: 'intensity',
    label: 'Intensity Index',
    value: '26.7 kgCO₂e/m²',
    delta: '-4.7% QoQ',
    trend: 'down'
  }
];

const mockEmissionTrend: EmissionTrendPoint[] = [
  { month: 'Jan', actual: 1420, target: 1480 },
  { month: 'Feb', actual: 1390, target: 1460 },
  { month: 'Mar', actual: 1368, target: 1440 },
  { month: 'Apr', actual: 1322, target: 1400 },
  { month: 'May', actual: 1290, target: 1380 },
  { month: 'Jun', actual: 1254, target: 1360 },
  { month: 'Jul', actual: 1238, target: 1340 },
  { month: 'Aug', actual: 1220, target: 1320 }
];

const mockSystemsMatrix: SystemHealthRow[] = [
  {
    id: 'SYS-1',
    subsystem: 'HVAC Controls',
    benchmark: 'EN-15232 Class A',
    status: 'Review',
    owner: 'Building Ops East'
  },
  {
    id: 'SYS-2',
    subsystem: 'Façade Thermal Envelope',
    benchmark: 'U-Value <= 0.20',
    status: 'Aligned',
    owner: 'Envelope Team'
  },
  {
    id: 'SYS-3',
    subsystem: 'District Heat Recovery',
    benchmark: 'Recovery > 55%',
    status: 'Intervention',
    owner: 'Energy Platforms'
  }
];

const withNetworkLatency = async <T>(payload: T): Promise<T> => {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(payload), 160);
  });
};

export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    getSitePortfolio: builder.query<SitePortfolioRow[], void>({
      queryFn: async () => ({ data: await withNetworkLatency(mockSitePortfolio) })
    }),
    getKpiCards: builder.query<KpiMetricCard[], void>({
      queryFn: async () => ({ data: await withNetworkLatency(mockKpiCards) })
    }),
    getEmissionTrend: builder.query<EmissionTrendPoint[], void>({
      queryFn: async () => ({ data: await withNetworkLatency(mockEmissionTrend) })
    }),
    getSystemsMatrix: builder.query<SystemHealthRow[], void>({
      queryFn: async () => ({ data: await withNetworkLatency(mockSystemsMatrix) })
    })
  })
});

export const {
  useGetSitePortfolioQuery,
  useGetKpiCardsQuery,
  useGetEmissionTrendQuery,
  useGetSystemsMatrixQuery
} = dashboardApi;
