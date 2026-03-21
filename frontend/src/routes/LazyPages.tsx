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

export const WissenPage = lazy(() =>
  import('../components/WissenPage/WissenSmartPage').then(m => ({ default: m.WissenSmartPage }))
);

export const CockpitPage = lazy(() =>
  import('../components/CockpitPage/CockpitSmartPage').then(m => ({ default: m.CockpitSmartPage }))
);

export const MeineKIPage = lazy(() =>
  import('../components/MeineKIPage/MeineKISmartPage').then(m => ({ default: m.MeineKISmartPage }))
);

export const SystemPage = lazy(() =>
  import('../components/SystemPage/SystemSmartPage').then(m => ({ default: m.SystemSmartPage }))
);

// Original full-featured pages (used until Smart Pages are wired up)
export const DocumentVaultPage = lazy(() =>
  import('../components/DocumentVaultPage').then(m => ({ default: m.DocumentVaultPage }))
);

export const BusinessDashboard = lazy(() =>
  import('../components/BusinessDashboard').then(m => ({ default: m.BusinessDashboard }))
);

export const MyAIPage = lazy(() =>
  import('../components/MyAIPage').then(m => ({ default: m.MyAIPage }))
);

export const SettingsDashboard = lazy(() =>
  import('../components/SettingsDashboard').then(m => ({ default: m.SettingsDashboard }))
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

export const NotificationsPage = lazy(() =>
  import('../components/NotificationsPage').then(m => ({ default: m.NotificationsPage }))
);

export const MemoryInsightsPage = lazy(() =>
  import('../components/MemoryInsightsPage/MemoryInsightsPage').then(m => ({ default: m.MemoryInsightsPage }))
);

export const SystemAdminPage = lazy(() =>
  import('../components/SystemAdminPage').then(m => ({ default: m.SystemAdminPage }))
);

export const ChatHub = lazy(() =>
  import('../components/ChatHub/ChatHub').then(m => ({ default: m.ChatHub }))
);
