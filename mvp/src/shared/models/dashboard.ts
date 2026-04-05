export type AnalysisTabId = 'overview' | 'emissions' | 'systems';

export interface SitePortfolioRow {
  id: string;
  name: string;
  typology: string;
  floorAreaM2: number;
  annualEmissionTco2e: number;
  healthStatus: 'Stable' | 'Watch' | 'Critical';
}

export interface EmissionTrendPoint {
  month: string;
  actual: number;
  target: number;
}

export interface KpiMetricCard {
  id: 'operational' | 'embodied' | 'intensity';
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down';
}

export interface SystemHealthRow {
  id: string;
  subsystem: string;
  benchmark: string;
  status: 'Aligned' | 'Review' | 'Intervention';
  owner: string;
}
