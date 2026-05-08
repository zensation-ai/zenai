/**
 * LazyPages — All lazy-loaded page imports in one file.
 *
 * Centralizes React.lazy() calls for:
 * - Tree-shaking: unused pages are never bundled
 * - Code splitting: each page is a separate chunk
 * - Single source of truth for page → module mapping
 */
import { lazy } from 'react';

export const ContactsPage = lazy(() =>
  import('../components/ContactsPage/ContactsPage').then(m => ({ default: m.ContactsPage }))
);

export const FinancePage = lazy(() =>
  import('../components/FinancePage/FinancePage').then(m => ({ default: m.FinancePage }))
);

export const IdeasPage = lazy(() =>
  import('../components/IdeasPage').then(m => ({ default: m.IdeasPage }))
);

export const AIWorkshop = lazy(() =>
  import('../components/AIWorkshop').then(m => ({ default: m.AIWorkshop }))
);

export const InsightsDashboard = lazy(() =>
  import('../components/InsightsDashboard').then(m => ({ default: m.InsightsDashboard }))
);

// Full-featured pages
export const DocumentVaultPage = lazy(() =>
  import('../components/DocumentVaultPage').then(m => ({ default: m.DocumentVaultPage }))
);

export const BusinessDashboard = lazy(() =>
  import('../components/BusinessDashboard').then(m => ({ default: m.BusinessDashboard }))
);

export const MyAIPage = lazy(() =>
  import('../components/MyAIPage').then(m => ({ default: m.MyAIPage }))
);

export const UserSettingsPage = lazy(() =>
  import('../components/settings/UserSettingsPage').then(m => ({ default: m.UserSettingsPage }))
);

export const AISettingsPage = lazy(() =>
  import('../components/settings/AISettingsPage').then(m => ({ default: m.AISettingsPage }))
);

export const IntegrationsSettingsPage = lazy(() =>
  import('../components/settings/IntegrationsSettingsPage').then(m => ({ default: m.IntegrationsSettingsPage }))
);

export const AdminSettingsPage = lazy(() =>
  import('../components/settings/AdminSettingsPage').then(m => ({ default: m.AdminSettingsPage }))
);

export const PlannerPage = lazy(() =>
  import('../components/PlannerPage/PlannerPage').then(m => ({ default: m.PlannerPage }))
);

export const EmailPage = lazy(() =>
  import('../components/EmailPage/InboxSmartPage').then(m => ({ default: m.InboxSmartPage }))
);

export const LearningDashboard = lazy(() =>
  import('../components/LearningDashboard').then(m => ({ default: m.LearningDashboard }))
);

export const ChatHub = lazy(() =>
  import('../components/ChatHub/ChatHub').then(m => ({ default: m.ChatHub }))
);

export const DemoPage = lazy(() =>
  import('../components/DemoPage/DemoPage').then(m => ({ default: m.DemoPage }))
);

export const PricingPage = lazy(() =>
  import('../components/PricingPage/PricingPage').then(m => ({ default: m.PricingPage }))
);

export const SocialMediaPage = lazy(() =>
  import('../components/SocialMediaPage/SocialMediaPage').then(m => ({ default: m.SocialMediaPage }))
);
