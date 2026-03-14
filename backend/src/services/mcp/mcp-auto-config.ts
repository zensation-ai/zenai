/**
 * MCP Auto-Configuration Templates - Phase 71
 *
 * Provides pre-built configuration templates for popular MCP servers.
 * Each template includes transport type, command, args, and required env vars
 * so users can set up servers with minimal manual configuration.
 */

import { logger } from '../../utils/logger';
import { MCPTransportType } from './mcp-transport';
import { mcpDiscoveryService, MCPCredentialField } from './mcp-discovery';

// ===========================================
// Types
// ===========================================

export interface MCPSetupTemplate {
  /** Server slug name */
  name: string;
  /** Display name */
  displayName: string;
  /** Transport type for connection */
  transport: MCPTransportType;
  /** Command for stdio transport */
  command: string | null;
  /** Default arguments */
  args: string[];
  /** npm package to run via npx */
  npmPackage: string | null;
  /** URL template for HTTP transport (null for stdio) */
  urlTemplate: string | null;
  /** Required credentials */
  requiredCredentials: MCPCredentialField[];
  /** Setup instructions */
  instructions: string;
}

export interface MCPCredentialValidation {
  valid: boolean;
  errors: string[];
}

// ===========================================
// Setup Templates
// ===========================================

const SETUP_TEMPLATES: Record<string, MCPSetupTemplate> = {
  slack: {
    name: 'slack',
    displayName: 'Slack',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    npmPackage: '@modelcontextprotocol/server-slack',
    urlTemplate: null,
    requiredCredentials: [],
    instructions: 'Create a Slack App at api.slack.com/apps, add Bot Token Scopes (channels:read, chat:write, users:read), and install to your workspace.',
  },
  'google-drive': {
    name: 'google-drive',
    displayName: 'Google Drive',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    npmPackage: '@modelcontextprotocol/server-gdrive',
    urlTemplate: null,
    requiredCredentials: [],
    instructions: 'Create OAuth2 credentials in Google Cloud Console with Drive API enabled. Run the server once to complete the OAuth flow.',
  },
  github: {
    name: 'github',
    displayName: 'GitHub',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    npmPackage: '@modelcontextprotocol/server-github',
    urlTemplate: null,
    requiredCredentials: [],
    instructions: 'Generate a Personal Access Token at github.com/settings/tokens with repo and issues scope.',
  },
  linear: {
    name: 'linear',
    displayName: 'Linear',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-linear'],
    npmPackage: '@modelcontextprotocol/server-linear',
    urlTemplate: null,
    requiredCredentials: [],
    instructions: 'Go to Linear Settings > API and create a personal API key.',
  },
  notion: {
    name: 'notion',
    displayName: 'Notion',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-notion'],
    npmPackage: '@modelcontextprotocol/server-notion',
    urlTemplate: null,
    requiredCredentials: [],
    instructions: 'Create an internal integration at notion.so/my-integrations and share the relevant pages/databases with it.',
  },
  'google-calendar': {
    name: 'google-calendar',
    displayName: 'Google Calendar',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-calendar'],
    npmPackage: '@modelcontextprotocol/server-google-calendar',
    urlTemplate: null,
    requiredCredentials: [],
    instructions: 'Create OAuth2 credentials in Google Cloud Console with Calendar API enabled. Run the server once to complete the OAuth flow.',
  },
  figma: {
    name: 'figma',
    displayName: 'Figma',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-figma'],
    npmPackage: '@anthropic/mcp-server-figma',
    urlTemplate: null,
    requiredCredentials: [],
    instructions: 'Go to Figma Account Settings and generate a personal access token.',
  },
  hubspot: {
    name: 'hubspot',
    displayName: 'HubSpot',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-hubspot'],
    npmPackage: '@modelcontextprotocol/server-hubspot',
    urlTemplate: null,
    requiredCredentials: [],
    instructions: 'Create a private app in HubSpot Developer Portal with CRM scopes (contacts, deals, companies).',
  },
};

// Populate requiredCredentials from discovery catalog
for (const [name, template] of Object.entries(SETUP_TEMPLATES)) {
  const catalogEntry = mcpDiscoveryService.getByName(name);
  if (catalogEntry) {
    template.requiredCredentials = catalogEntry.requiredCredentials;
  }
}

// ===========================================
// Auto-Config Service
// ===========================================

class MCPAutoConfigService {
  /**
   * Get setup template for a known server
   */
  getSetupTemplate(serverName: string): MCPSetupTemplate | null {
    const template = SETUP_TEMPLATES[serverName];
    if (!template) {
      logger.debug('No setup template found for server', { serverName });
      return null;
    }
    return { ...template };
  }

  /**
   * Validate credentials for a server
   */
  validateCredentials(
    serverName: string,
    credentials: Record<string, string>
  ): MCPCredentialValidation {
    const template = SETUP_TEMPLATES[serverName];
    if (!template) {
      return { valid: false, errors: [`Unknown server: ${serverName}`] };
    }

    const errors: string[] = [];

    for (const field of template.requiredCredentials) {
      if (field.required) {
        const value = credentials[field.key];
        if (!value || value.trim().length === 0) {
          errors.push(`${field.label} is required`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build server creation payload from template + credentials
   */
  buildServerConfig(
    serverName: string,
    credentials: Record<string, string>
  ): {
    name: string;
    transport: MCPTransportType;
    command?: string;
    args?: string[];
    url?: string;
    envVars?: Record<string, string>;
    enabled: boolean;
  } | null {
    const template = this.getSetupTemplate(serverName);
    if (!template) return null;

    const config: {
      name: string;
      transport: MCPTransportType;
      command?: string;
      args?: string[];
      url?: string;
      envVars?: Record<string, string>;
      enabled: boolean;
    } = {
      name: template.displayName,
      transport: template.transport,
      enabled: true,
    };

    if (template.transport === 'stdio') {
      config.command = template.command || 'npx';
      config.args = [...template.args];
    } else if (template.urlTemplate) {
      config.url = template.urlTemplate;
    }

    // Pass credentials as env vars
    if (Object.keys(credentials).length > 0) {
      config.envVars = { ...credentials };
    }

    return config;
  }

  /**
   * List all available template names
   */
  listTemplateNames(): string[] {
    return Object.keys(SETUP_TEMPLATES);
  }

  /**
   * Check if a template exists
   */
  hasTemplate(serverName: string): boolean {
    return serverName in SETUP_TEMPLATES;
  }
}

// Singleton
export const mcpAutoConfigService = new MCPAutoConfigService();

// Export for testing
export { SETUP_TEMPLATES };
