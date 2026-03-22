/**
 * MCP Server Discovery - Phase 71
 *
 * Provides a built-in catalog of popular community MCP servers
 * and search/filter capabilities for the MCP Ecosystem Hub.
 *
 * The catalog is a static in-memory list of well-known MCP servers
 * with metadata for display, setup templates, and popularity ranking.
 */

// logger available if needed for future use

// ===========================================
// Types
// ===========================================

export type MCPServerCategory =
  | 'communication'
  | 'productivity'
  | 'development'
  | 'design'
  | 'crm'
  | 'storage';

export interface MCPCatalogEntry {
  /** Unique slug identifier */
  name: string;
  /** Display name */
  displayName: string;
  /** Short description */
  description: string;
  /** Server category */
  category: MCPServerCategory;
  /** npm package name (for stdio transport) */
  npmPackage: string | null;
  /** GitHub/source repository URL */
  repoUrl: string;
  /** Credentials required to use this server */
  requiredCredentials: MCPCredentialField[];
  /** Popularity score (0-100) for sorting */
  popularity: number;
  /** Estimated number of tools provided */
  estimatedTools: number;
  /** Icon identifier (used by frontend) */
  icon: string;
  /** Whether this is a premium/paid server */
  premium: boolean;
}

export interface MCPCredentialField {
  /** Environment variable name */
  key: string;
  /** Human-readable label */
  label: string;
  /** Description / help text */
  description: string;
  /** Whether this credential is required */
  required: boolean;
  /** Input type hint for frontend */
  type: 'text' | 'password' | 'url';
}

export interface MCPDiscoverResult {
  servers: MCPCatalogEntry[];
  total: number;
  categories: MCPServerCategory[];
}

// ===========================================
// Built-in Catalog
// ===========================================

const MCP_SERVER_CATALOG: MCPCatalogEntry[] = [
  {
    name: 'slack',
    displayName: 'Slack',
    description: 'Send messages, manage channels, search conversations, and interact with Slack workspaces.',
    category: 'communication',
    npmPackage: '@modelcontextprotocol/server-slack',
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    requiredCredentials: [
      {
        key: 'SLACK_BOT_TOKEN',
        label: 'Slack Bot Token',
        description: 'Bot User OAuth Token (xoxb-...) from your Slack App',
        required: true,
        type: 'password',
      },
      {
        key: 'SLACK_TEAM_ID',
        label: 'Slack Team ID',
        description: 'Your Slack workspace Team ID',
        required: false,
        type: 'text',
      },
    ],
    popularity: 95,
    estimatedTools: 12,
    icon: 'slack',
    premium: false,
  },
  {
    name: 'google-drive',
    displayName: 'Google Drive',
    description: 'Search, read, and manage files in Google Drive. Supports Docs, Sheets, and other file types.',
    category: 'storage',
    npmPackage: '@modelcontextprotocol/server-gdrive',
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
    requiredCredentials: [
      {
        key: 'GOOGLE_CLIENT_ID',
        label: 'Google Client ID',
        description: 'OAuth2 Client ID from Google Cloud Console',
        required: true,
        type: 'text',
      },
      {
        key: 'GOOGLE_CLIENT_SECRET',
        label: 'Google Client Secret',
        description: 'OAuth2 Client Secret from Google Cloud Console',
        required: true,
        type: 'password',
      },
    ],
    popularity: 92,
    estimatedTools: 8,
    icon: 'google-drive',
    premium: false,
  },
  {
    name: 'github',
    displayName: 'GitHub',
    description: 'Manage repositories, issues, pull requests, and code search on GitHub.',
    category: 'development',
    npmPackage: '@modelcontextprotocol/server-github',
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    requiredCredentials: [
      {
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        label: 'GitHub Personal Access Token',
        description: 'PAT with repo and issues scope (ghp_...)',
        required: true,
        type: 'password',
      },
    ],
    popularity: 97,
    estimatedTools: 18,
    icon: 'github',
    premium: false,
  },
  {
    name: 'linear',
    displayName: 'Linear',
    description: 'Create and manage issues, projects, and cycles in Linear project management.',
    category: 'productivity',
    npmPackage: '@modelcontextprotocol/server-linear',
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/linear',
    requiredCredentials: [
      {
        key: 'LINEAR_API_KEY',
        label: 'Linear API Key',
        description: 'Personal API key from Linear Settings > API',
        required: true,
        type: 'password',
      },
    ],
    popularity: 82,
    estimatedTools: 10,
    icon: 'linear',
    premium: false,
  },
  {
    name: 'notion',
    displayName: 'Notion',
    description: 'Search, read, and create pages and databases in Notion workspaces.',
    category: 'productivity',
    npmPackage: '@modelcontextprotocol/server-notion',
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/notion',
    requiredCredentials: [
      {
        key: 'NOTION_API_KEY',
        label: 'Notion Integration Token',
        description: 'Internal integration token from Notion Integrations page (secret_...)',
        required: true,
        type: 'password',
      },
    ],
    popularity: 88,
    estimatedTools: 9,
    icon: 'notion',
    premium: false,
  },
  {
    name: 'google-calendar',
    displayName: 'Google Calendar',
    description: 'View, create, and manage calendar events across Google Calendar accounts.',
    category: 'productivity',
    npmPackage: '@modelcontextprotocol/server-google-calendar',
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/google-calendar',
    requiredCredentials: [
      {
        key: 'GOOGLE_CLIENT_ID',
        label: 'Google Client ID',
        description: 'OAuth2 Client ID from Google Cloud Console',
        required: true,
        type: 'text',
      },
      {
        key: 'GOOGLE_CLIENT_SECRET',
        label: 'Google Client Secret',
        description: 'OAuth2 Client Secret from Google Cloud Console',
        required: true,
        type: 'password',
      },
    ],
    popularity: 85,
    estimatedTools: 7,
    icon: 'google-calendar',
    premium: false,
  },
  {
    name: 'figma',
    displayName: 'Figma',
    description: 'Access Figma files, inspect design components, and extract design tokens.',
    category: 'design',
    npmPackage: '@anthropic/mcp-server-figma',
    repoUrl: 'https://github.com/anthropics/mcp-server-figma',
    requiredCredentials: [
      {
        key: 'FIGMA_ACCESS_TOKEN',
        label: 'Figma Access Token',
        description: 'Personal access token from Figma Account Settings',
        required: true,
        type: 'password',
      },
    ],
    popularity: 78,
    estimatedTools: 6,
    icon: 'figma',
    premium: false,
  },
  {
    name: 'hubspot',
    displayName: 'HubSpot',
    description: 'Manage contacts, deals, companies, and tickets in HubSpot CRM.',
    category: 'crm',
    npmPackage: '@modelcontextprotocol/server-hubspot',
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/hubspot',
    requiredCredentials: [
      {
        key: 'HUBSPOT_ACCESS_TOKEN',
        label: 'HubSpot Access Token',
        description: 'Private app access token from HubSpot Developer Portal',
        required: true,
        type: 'password',
      },
    ],
    popularity: 75,
    estimatedTools: 14,
    icon: 'hubspot',
    premium: false,
  },
];

// ===========================================
// All available categories
// ===========================================

const ALL_CATEGORIES: MCPServerCategory[] = [
  'communication',
  'productivity',
  'development',
  'design',
  'crm',
  'storage',
];

// ===========================================
// Discovery Service
// ===========================================

class MCPDiscoveryService {
  private catalog: MCPCatalogEntry[];

  constructor() {
    this.catalog = [...MCP_SERVER_CATALOG];
  }

  /**
   * Discover available MCP servers with optional filtering
   */
  discoverServers(query?: string, category?: MCPServerCategory): MCPDiscoverResult {
    let results = [...this.catalog];

    // Filter by category
    if (category && ALL_CATEGORIES.includes(category)) {
      results = results.filter(s => s.category === category);
    }

    // Filter by search query
    if (query && query.trim().length > 0) {
      results = this.searchServers(query, results);
    }

    // Sort by popularity descending
    results.sort((a, b) => b.popularity - a.popularity);

    return {
      servers: results,
      total: results.length,
      categories: ALL_CATEGORIES,
    };
  }

  /**
   * Search servers by text query
   */
  searchServers(query: string, serverList?: MCPCatalogEntry[]): MCPCatalogEntry[] {
    const source = serverList || this.catalog;
    const lowerQuery = query.toLowerCase().trim();

    if (lowerQuery.length === 0) {return source;}

    return source.filter(server => {
      const searchableText = [
        server.name,
        server.displayName,
        server.description,
        server.category,
        server.npmPackage || '',
      ].join(' ').toLowerCase();

      return searchableText.includes(lowerQuery);
    });
  }

  /**
   * Get a specific server entry by name
   */
  getByName(name: string): MCPCatalogEntry | null {
    return this.catalog.find(s => s.name === name) || null;
  }

  /**
   * Get all available categories
   */
  getCategories(): MCPServerCategory[] {
    return [...ALL_CATEGORIES];
  }

  /**
   * Get catalog size
   */
  get size(): number {
    return this.catalog.length;
  }
}

// Singleton
export const mcpDiscoveryService = new MCPDiscoveryService();

// Export the catalog for testing
export { MCP_SERVER_CATALOG, ALL_CATEGORIES };
