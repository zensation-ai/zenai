/**
 * Phase 12: OpenAPI/Swagger Configuration
 *
 * Provides API documentation at /api-docs
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Personal AI Brain API',
      version: '2.0.0',
      description: `
## Personal AI Brain - Dual Context API

A sophisticated personal knowledge management system with AI-powered structuring.

### Features
- **Voice Memo Processing**: Transcribe and structure voice memos
- **Idea Management**: Full CRUD with semantic search
- **Dual Context**: Separate personal and work databases
- **Thought Incubator**: Cluster loose thoughts into ideas
- **Analytics**: Usage statistics and insights

### Authentication
API endpoints support optional API key authentication via:
- Header: \`Authorization: Bearer ab_xxx\`
- Header: \`x-api-key: ab_xxx\`

### Context Selection
Use the \`X-AI-Context\` header or \`context\` query parameter:
- \`personal\` (default)
- \`work\`
      `,
      contact: {
        name: 'Personal AI Brain',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'Health', description: 'System health checks' },
      { name: 'Ideas', description: 'Idea management' },
      { name: 'Voice Memo', description: 'Voice memo processing' },
      { name: 'Incubator', description: 'Thought incubation and clustering' },
      { name: 'Analytics', description: 'Usage analytics' },
      { name: 'Sync', description: 'Offline synchronization' },
      { name: 'API Keys', description: 'API key management' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
            },
          },
        },
        Idea: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            content: { type: 'string' },
            type: { type: 'string', enum: ['idea', 'task', 'note', 'question', 'reminder'] },
            category: { type: 'string', enum: ['general', 'work', 'personal', 'health', 'finance', 'learning', 'creative', 'relationship', 'travel', 'other'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            summary: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            next_steps: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        LooseThought: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            text: { type: 'string' },
            source: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            processed: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        ThoughtCluster: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            theme: { type: 'string' },
            summary: { type: 'string' },
            status: { type: 'string', enum: ['incubating', 'ready', 'consolidated', 'dismissed'] },
            thoughts: { type: 'array', items: { $ref: '#/components/schemas/LooseThought' } },
          },
        },
        AnalyticsOverview: {
          type: 'object',
          properties: {
            summary: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                active: { type: 'integer' },
                archived: { type: 'integer' },
              },
            },
            distribution: {
              type: 'object',
              properties: {
                byCategory: { type: 'object' },
                byType: { type: 'object' },
                byPriority: { type: 'object' },
              },
            },
          },
        },
      },
      parameters: {
        ContextHeader: {
          name: 'X-AI-Context',
          in: 'header',
          description: 'AI context (personal or work)',
          schema: { type: 'string', enum: ['personal', 'work'], default: 'personal' },
        },
        ContextPath: {
          name: 'context',
          in: 'path',
          required: true,
          description: 'AI context (personal or work)',
          schema: { type: 'string', enum: ['personal', 'work'] },
        },
        IdPath: {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Resource UUID',
          schema: { type: 'string', format: 'uuid' },
        },
        LimitQuery: {
          name: 'limit',
          in: 'query',
          description: 'Number of items to return',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        OffsetQuery: {
          name: 'offset',
          in: 'query',
          description: 'Number of items to skip',
          schema: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
    paths: {
      '/api/health': {
        get: {
          tags: ['Health'],
          summary: 'Check API health',
          responses: {
            200: {
              description: 'API is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string', format: 'date-time' },
                      services: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/ideas': {
        get: {
          tags: ['Ideas'],
          summary: 'List all ideas',
          parameters: [
            { $ref: '#/components/parameters/ContextHeader' },
            { $ref: '#/components/parameters/LimitQuery' },
            { $ref: '#/components/parameters/OffsetQuery' },
            { name: 'type', in: 'query', schema: { type: 'string' } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'priority', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'List of ideas',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ideas: { type: 'array', items: { $ref: '#/components/schemas/Idea' } },
                      total: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/ideas/{id}': {
        get: {
          tags: ['Ideas'],
          summary: 'Get idea by ID',
          parameters: [
            { $ref: '#/components/parameters/IdPath' },
            { $ref: '#/components/parameters/ContextHeader' },
          ],
          responses: {
            200: { description: 'Idea details' },
            404: { description: 'Idea not found' },
          },
        },
      },
      '/api/ideas/search': {
        post: {
          tags: ['Ideas'],
          summary: 'Semantic search for ideas',
          parameters: [{ $ref: '#/components/parameters/ContextHeader' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['query'],
                  properties: {
                    query: { type: 'string', description: 'Search query' },
                    limit: { type: 'integer', default: 20 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Search results' },
          },
        },
      },
      '/api/{context}/analytics/overview': {
        get: {
          tags: ['Analytics'],
          summary: 'Get analytics overview',
          parameters: [{ $ref: '#/components/parameters/ContextPath' }],
          responses: {
            200: {
              description: 'Analytics overview',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AnalyticsOverview' },
                },
              },
            },
          },
        },
      },
      '/api/incubator/thoughts': {
        get: {
          tags: ['Incubator'],
          summary: 'Get loose thoughts',
          parameters: [
            { name: 'context', in: 'query', schema: { type: 'string', enum: ['personal', 'work'] } },
            { $ref: '#/components/parameters/LimitQuery' },
          ],
          responses: {
            200: {
              description: 'List of loose thoughts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      thoughts: { type: 'array', items: { $ref: '#/components/schemas/LooseThought' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/incubator/clusters': {
        get: {
          tags: ['Incubator'],
          summary: 'Get thought clusters',
          responses: {
            200: {
              description: 'List of clusters',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      clusters: { type: 'array', items: { $ref: '#/components/schemas/ThoughtCluster' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [], // We define everything in the spec above
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Personal AI Brain API',
  }));

  // Serve raw OpenAPI spec
  app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
  });
}
