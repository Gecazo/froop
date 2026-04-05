import type { FormEvent } from 'react';

import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import {
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';

import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle.ts';
import {
  DEFAULT_SETTINGS_VALUES,
  type PlatformSettingsFormValues
} from '@/shared/models/settings.ts';
import { platformSettingsSchema } from '@/shared/schemas/settingsSchema.ts';

import styles from '@/pages/SettingsPage.module.scss';

const methodologyOptions: PlatformSettingsFormValues['defaultMethodology'][] = [
  'EN-15978',
  'LEED-v4',
  'BREEAM-International'
];

export const SettingsPage = () => {
  useDocumentTitle('Settings');

  const { enqueueSnackbar } = useSnackbar();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<PlatformSettingsFormValues>({
    resolver: zodResolver(platformSettingsSchema),
    defaultValues: DEFAULT_SETTINGS_VALUES,
    mode: 'onSubmit'
  });

  const onSubmit = async (values: PlatformSettingsFormValues): Promise<void> => {
    await Promise.resolve();

    enqueueSnackbar(`Settings updated for ${values.organizationName}.`, {
      variant: 'success'
    });
  };

  const onFormSubmit = (event: FormEvent<HTMLFormElement>): void => {
    void handleSubmit(onSubmit)(event);
  };

  return (
    <Box className={styles.page}>
      <Typography variant="h3">Platform Settings</Typography>
      <Typography variant="body1" color="text.secondary">
        Control reporting defaults, portfolio governance, and alerting behavior.
      </Typography>

      <Paper className={styles.formPanel}>
        <Box component="form" className={styles.form} onSubmit={onFormSubmit}>
          <TextField
            label="Organization Name"
            {...register('organizationName')}
            error={Boolean(errors.organizationName)}
            helperText={errors.organizationName?.message}
            fullWidth
          />

          <Controller
            name="defaultMethodology"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="Default Methodology"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                inputRef={field.ref}
                error={Boolean(errors.defaultMethodology)}
                helperText={errors.defaultMethodology?.message}
                fullWidth
              >
                {methodologyOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Reporting Year"
              type="number"
              {...register('reportingYear', { valueAsNumber: true })}
              error={Boolean(errors.reportingYear)}
              helperText={errors.reportingYear?.message}
              fullWidth
            />
            <TextField
              label="Target Reduction (%)"
              type="number"
              {...register('targetReduction', { valueAsNumber: true })}
              error={Boolean(errors.targetReduction)}
              helperText={errors.targetReduction?.message}
              fullWidth
            />
          </Stack>

          <TextField
            label="Alert Email"
            type="email"
            {...register('alertEmail')}
            error={Boolean(errors.alertEmail)}
            helperText={errors.alertEmail?.message}
            fullWidth
          />

          <Controller
            name="autoPublish"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Switch
                    checked={field.value}
                    onChange={(event) => {
                      field.onChange(event.target.checked);
                    }}
                  />
                }
                label="Auto-publish validated analysis snapshots"
              />
            )}
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            startIcon={<SaveOutlinedIcon />}
            disabled={isSubmitting}
          >
            Save Configuration
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};
