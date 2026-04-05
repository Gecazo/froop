export interface PlatformSettingsFormValues {
  organizationName: string;
  defaultMethodology: 'EN-15978' | 'LEED-v4' | 'BREEAM-International';
  reportingYear: number;
  targetReduction: number;
  alertEmail: string;
  autoPublish: boolean;
}

export const DEFAULT_SETTINGS_VALUES: PlatformSettingsFormValues = {
  organizationName: 'Helio Core Developments',
  defaultMethodology: 'EN-15978',
  reportingYear: 2032,
  targetReduction: 42,
  alertEmail: 'ops@heliocore.io',
  autoPublish: true
};
