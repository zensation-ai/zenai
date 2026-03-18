/**
 * Navigation Icon Mapping
 *
 * Maps page identifiers and nav labels to lucide-react icons.
 * Single source of truth for all navigation icons across Sidebar,
 * MobileBottomBar, MobileSidebarDrawer, and CommandPalette.
 */

import {
  LayoutDashboard,
  MessageSquare,
  Lightbulb,
  Wrench,
  BarChart3,
  FileText,
  Briefcase,
  GraduationCap,
  Brain,
  Settings,
  Bell,
  Mail,
  Calendar,
  Users,
  Wallet,
  Globe,
  Monitor,
  LogOut,
  Star,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Sparkles,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';

import type { Page } from '../types';

/**
 * Map of page identifiers to lucide-react icon components
 */
export const PAGE_ICONS: Record<string, LucideIcon> = {
  home: LayoutDashboard,
  chat: MessageSquare,
  ideas: Lightbulb,
  incubator: Lightbulb,
  archive: Lightbulb,
  triage: Lightbulb,
  workshop: Wrench,
  proactive: Sparkles,
  evolution: Wrench,
  'agent-teams': Wrench,
  insights: BarChart3,
  analytics: BarChart3,
  digest: BarChart3,
  'knowledge-graph': BarChart3,
  documents: FileText,
  canvas: FileText,
  media: FileText,
  business: Briefcase,
  learning: GraduationCap,
  'learning-tasks': GraduationCap,
  'my-ai': Brain,
  'voice-chat': Brain,
  'memory-insights': Brain,
  settings: Settings,
  profile: Settings,
  automations: Settings,
  integrations: Settings,
  'mcp-servers': Settings,
  export: Settings,
  sync: Settings,
  notifications: Bell,
  email: Mail,
  calendar: Calendar,
  tasks: Calendar,
  kanban: Calendar,
  gantt: Calendar,
  meetings: Calendar,
  contacts: Users,
  finance: Wallet,
  browser: Globe,
  'screen-memory': Monitor,
  'system-admin': Monitor,
};

/**
 * Get the lucide icon for a given page
 */
export function getPageIcon(page: Page): LucideIcon {
  return PAGE_ICONS[page] ?? BookOpen;
}

/**
 * Map of Lucide icon names (strings) to components.
 * Used by MobileSidebarDrawer and Breadcrumbs to render icons
 * from navigation.ts icon names.
 */
export const ICON_BY_NAME: Record<string, LucideIcon> = {
  LayoutDashboard,
  MessageSquare,
  Lightbulb,
  Wrench,
  BarChart3,
  FileText,
  Briefcase,
  GraduationCap,
  Brain,
  Settings,
  Bell,
  Mail,
  Calendar,
  Users,
  Wallet,
  Globe,
  Monitor,
  Sparkles,
  BookOpen,
  Star,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
};

/**
 * Render a Lucide icon by its string name.
 * Falls back to BookOpen if name is not found.
 */
export function getIconByName(name: string): LucideIcon {
  return ICON_BY_NAME[name] ?? BookOpen;
}

// Re-export commonly used icons for direct access
export {
  LayoutDashboard,
  MessageSquare,
  Lightbulb,
  Wrench,
  BarChart3,
  FileText,
  Briefcase,
  GraduationCap,
  Brain,
  Settings,
  Bell,
  Mail,
  Calendar,
  Users,
  Wallet,
  Globe,
  Monitor,
  LogOut,
  Star,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Sparkles,
};
