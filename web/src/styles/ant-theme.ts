import type { ThemeConfig } from 'antd';
import { spacing } from '@/styles/spacing';

export const antTheme: ThemeConfig = {
  token: {
    colorPrimary: '#424242',
    borderRadius: 12,
    colorBgLayout: '#ededed',
    colorBgContainer: '#f5f5f5',
    marginXS: spacing.xs,
    marginSM: spacing.sm,
    margin: spacing.md,
    marginMD: spacing.md,
    marginLG: spacing.lg,
    marginXL: spacing.xl,
    padding: spacing.md,
    paddingLG: spacing.lg,
    paddingSM: spacing.sm,
    paddingXS: spacing.xs,
  },
  components: {
    Button: {
      borderRadius: 9999,
    },
    Card: {
      borderRadiusLG: 16,
      paddingLG: spacing.md,
    },
    Input: {
      borderRadius: 9999,
    },
    Select: {
      borderRadius: 9999,
    },
    Form: {
      itemMarginBottom: spacing.md,
    },
    Space: {
      padding: spacing.xs,
    },
  },
};
