import { z } from 'zod';

export const platformSettingsSchema = z.object({
  organizationName: z.string().trim().min(3, 'Organization name is required.'),
  defaultMethodology: z.enum(['EN-15978', 'LEED-v4', 'BREEAM-International']),
  reportingYear: z
    .number('Reporting year must be a number.')
    .int('Reporting year must be an integer.')
    .min(2020, 'Reporting year must be 2020 or later.')
    .max(2100, 'Reporting year must be 2100 or earlier.'),
  targetReduction: z
    .number('Reduction target must be a number.')
    .min(1, 'Reduction target must be at least 1%.')
    .max(100, 'Reduction target cannot exceed 100%.'),
  alertEmail: z.string().trim().email('Provide a valid alert email.'),
  autoPublish: z.boolean()
});
