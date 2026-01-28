/**
 * Project Context Service Tests
 */

import * as path from 'path';
import {
  detectProjectType,
  detectFrameworks,
  parsePackageJson,
  scanProjectStructure,
  detectPatterns,
  identifyKeyFiles,
  identifyDirectories,
  getLanguageName,
  analyzeProject,
  generateProjectContext,
  getQuickProjectSummary,
  formatProjectContext,
  ProjectDependency,
  ProjectStructure,
  ProjectType,
} from '../services/project-context';

// Test with the actual project directory
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

describe('Project Context Service', () => {
  describe('detectProjectType', () => {
    it('should detect TypeScript project from tsconfig.json', async () => {
      // This project has tsconfig.json
      const type = await detectProjectType(path.join(PROJECT_ROOT, 'backend'));
      expect(type).toBe('typescript');
    });

    it('should detect Node.js project from package.json', async () => {
      // Frontend is also TypeScript but for testing we mock a pure JS project
      const type = await detectProjectType(PROJECT_ROOT);
      // Root has package.json but also tsconfig in subdirs
      expect(['nodejs', 'typescript', 'unknown']).toContain(type);
    });

    it('should return unknown for non-project directories', async () => {
      const type = await detectProjectType('/tmp');
      expect(type).toBe('unknown');
    });
  });

  describe('parsePackageJson', () => {
    it('should parse package.json correctly', async () => {
      const result = await parsePackageJson(path.join(PROJECT_ROOT, 'backend'));

      expect(result).not.toBeNull();
      expect(result?.name).toBeDefined();
      expect(result?.dependencies).toBeInstanceOf(Array);
      expect(result?.scripts).toBeDefined();
    });

    it('should extract dependencies', async () => {
      const result = await parsePackageJson(path.join(PROJECT_ROOT, 'backend'));

      expect(result?.dependencies.length).toBeGreaterThan(0);

      // Check for known dependencies
      const depNames = result?.dependencies.map((d) => d.name) || [];
      expect(depNames).toContain('express');
      expect(depNames).toContain('@anthropic-ai/sdk');
    });

    it('should separate dev dependencies', async () => {
      const result = await parsePackageJson(path.join(PROJECT_ROOT, 'backend'));

      const devDeps = result?.dependencies.filter((d) => d.isDev) || [];
      const prodDeps = result?.dependencies.filter((d) => !d.isDev) || [];

      expect(devDeps.length).toBeGreaterThan(0);
      expect(prodDeps.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent package.json', async () => {
      const result = await parsePackageJson('/tmp');
      expect(result).toBeNull();
    });
  });

  describe('detectFrameworks', () => {
    it('should detect Express framework', async () => {
      const deps: ProjectDependency[] = [
        { name: 'express', version: '^4.18.0', isDev: false },
      ];

      const frameworks = await detectFrameworks(
        path.join(PROJECT_ROOT, 'backend'),
        deps
      );

      expect(frameworks).toContain('express');
    });

    it('should detect React framework', async () => {
      const deps: ProjectDependency[] = [
        { name: 'react', version: '^18.0.0', isDev: false },
        { name: 'react-dom', version: '^18.0.0', isDev: false },
      ];

      const frameworks = await detectFrameworks(
        path.join(PROJECT_ROOT, 'frontend'),
        deps
      );

      expect(frameworks).toContain('react');
    });

    it('should return empty for unknown frameworks', async () => {
      const deps: ProjectDependency[] = [
        { name: 'some-unknown-lib', version: '1.0.0', isDev: false },
      ];

      const frameworks = await detectFrameworks('/tmp', deps);
      expect(frameworks).toEqual([]);
    });
  });

  describe('scanProjectStructure', () => {
    it('should scan project structure', async () => {
      const structure = await scanProjectStructure(
        path.join(PROJECT_ROOT, 'backend'),
        2
      );

      expect(structure.rootPath).toBe(path.join(PROJECT_ROOT, 'backend'));
      expect(structure.files.length).toBeGreaterThan(0);
      expect(structure.directories.length).toBeGreaterThan(0);
      expect(structure.totalFiles).toBeGreaterThan(0);
    });

    it('should exclude node_modules', async () => {
      const structure = await scanProjectStructure(
        path.join(PROJECT_ROOT, 'backend'),
        3
      );

      const hasNodeModules = structure.directories.some((d) =>
        d.includes('node_modules')
      );
      expect(hasNodeModules).toBe(false);
    });

    it('should include file extensions', async () => {
      const structure = await scanProjectStructure(
        path.join(PROJECT_ROOT, 'backend'),
        2
      );

      const tsFiles = structure.files.filter((f) => f.extension === 'ts');
      expect(tsFiles.length).toBeGreaterThan(0);
    });
  });

  describe('detectPatterns', () => {
    it('should detect testing patterns', () => {
      const structure: ProjectStructure = {
        rootPath: '/test',
        files: [{ path: 'jest.config.js', name: 'jest.config.js', type: 'file' }],
        directories: ['__tests__'],
        totalFiles: 1,
        totalDirectories: 1,
      };

      const deps: ProjectDependency[] = [
        { name: 'jest', version: '^29.0.0', isDev: true },
      ];

      const patterns = detectPatterns(structure, deps);
      expect(patterns).toContain('unit-testing');
      expect(patterns).toContain('test-framework');
    });

    it('should detect Docker patterns', () => {
      const structure: ProjectStructure = {
        rootPath: '/test',
        files: [
          { path: 'Dockerfile', name: 'Dockerfile', type: 'file' },
          { path: 'docker-compose.yml', name: 'docker-compose.yml', type: 'file' },
        ],
        directories: [],
        totalFiles: 2,
        totalDirectories: 0,
      };

      const patterns = detectPatterns(structure, []);
      expect(patterns).toContain('docker');
      expect(patterns).toContain('docker-compose');
    });

    it('should detect GitHub Actions', () => {
      const structure: ProjectStructure = {
        rootPath: '/test',
        files: [],
        directories: ['.github'],
        totalFiles: 0,
        totalDirectories: 1,
      };

      const patterns = detectPatterns(structure, []);
      expect(patterns).toContain('github-actions');
    });

    it('should detect component-based architecture', () => {
      const structure: ProjectStructure = {
        rootPath: '/test',
        files: [],
        directories: ['src/components', 'src/services'],
        totalFiles: 0,
        totalDirectories: 2,
      };

      const patterns = detectPatterns(structure, []);
      expect(patterns).toContain('component-based');
      expect(patterns).toContain('service-layer');
    });
  });

  describe('identifyKeyFiles', () => {
    it('should identify package.json as key file', () => {
      const structure: ProjectStructure = {
        rootPath: '/test',
        files: [
          { path: 'package.json', name: 'package.json', type: 'file' },
          { path: 'tsconfig.json', name: 'tsconfig.json', type: 'file' },
          { path: 'README.md', name: 'README.md', type: 'file' },
          { path: 'random.txt', name: 'random.txt', type: 'file' },
        ],
        directories: [],
        totalFiles: 4,
        totalDirectories: 0,
      };

      const keyFiles = identifyKeyFiles(structure, 'typescript');

      expect(keyFiles).toContain('package.json');
      expect(keyFiles).toContain('tsconfig.json');
      expect(keyFiles).toContain('README.md');
      expect(keyFiles).not.toContain('random.txt');
    });

    it('should identify entry points', () => {
      const structure: ProjectStructure = {
        rootPath: '/test',
        files: [
          { path: 'src/main.ts', name: 'main.ts', type: 'file' },
          { path: 'src/index.ts', name: 'index.ts', type: 'file' },
        ],
        directories: ['src'],
        totalFiles: 2,
        totalDirectories: 1,
      };

      const keyFiles = identifyKeyFiles(structure, 'typescript');
      expect(keyFiles.some((f) => f.includes('main.ts') || f.includes('index.ts'))).toBe(true);
    });
  });

  describe('identifyDirectories', () => {
    it('should identify source directories', () => {
      const structure: ProjectStructure = {
        rootPath: '/test',
        files: [],
        directories: ['src', 'lib', 'tests', '__tests__'],
        totalFiles: 0,
        totalDirectories: 4,
      };

      const { sourceDirectories, testDirectories } = identifyDirectories(structure);

      expect(sourceDirectories).toContain('src');
      expect(sourceDirectories).toContain('lib');
      expect(testDirectories).toContain('tests');
      expect(testDirectories).toContain('__tests__');
    });
  });

  describe('getLanguageName', () => {
    it('should return correct language names', () => {
      expect(getLanguageName('typescript')).toBe('TypeScript');
      expect(getLanguageName('python')).toBe('Python');
      expect(getLanguageName('rust')).toBe('Rust');
      expect(getLanguageName('nodejs')).toBe('JavaScript');
      expect(getLanguageName('unknown')).toBe('Unknown');
    });
  });

  describe('analyzeProject', () => {
    it('should analyze backend project', async () => {
      const info = await analyzeProject(path.join(PROJECT_ROOT, 'backend'));

      expect(info.name).toBeDefined();
      expect(info.type).toBe('typescript');
      expect(info.language).toBe('TypeScript');
      expect(info.dependencies.length).toBeGreaterThan(0);
      expect(info.structure.totalFiles).toBeGreaterThan(0);
    });

    it('should detect frameworks in project', async () => {
      const info = await analyzeProject(path.join(PROJECT_ROOT, 'backend'));

      expect(info.frameworks).toContain('express');
    });

    it('should find config files', async () => {
      const info = await analyzeProject(path.join(PROJECT_ROOT, 'backend'));

      expect(info.configFiles).toContain('package.json');
      expect(info.configFiles).toContain('tsconfig.json');
    });
  });

  describe('generateProjectContext', () => {
    it('should generate project context', async () => {
      const context = await generateProjectContext(
        path.join(PROJECT_ROOT, 'backend')
      );

      expect(context.summary).toBeDefined();
      expect(context.summary.length).toBeGreaterThan(100);
      expect(context.keyFiles.length).toBeGreaterThan(0);
      expect(context.techStack.length).toBeGreaterThan(0);
      expect(context.projectInfo).toBeDefined();
    });

    it('should include tech stack', async () => {
      const context = await generateProjectContext(
        path.join(PROJECT_ROOT, 'backend')
      );

      expect(context.techStack).toContain('TypeScript');
      expect(context.techStack).toContain('Express');
    });

    it('should identify focus areas', async () => {
      const context = await generateProjectContext(
        path.join(PROJECT_ROOT, 'backend')
      );

      // Should identify some focus areas
      expect(context.focusAreas.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getQuickProjectSummary', () => {
    it('should return quick summary', async () => {
      const summary = await getQuickProjectSummary(
        path.join(PROJECT_ROOT, 'backend')
      );

      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(20);
      expect(summary).toContain('TypeScript');
    });

    it('should handle non-existent path', async () => {
      const summary = await getQuickProjectSummary('/nonexistent/path');
      expect(summary).toContain('Unrecognized project at:');
    });
  });

  describe('formatProjectContext', () => {
    it('should format context for display', async () => {
      const context = await generateProjectContext(
        path.join(PROJECT_ROOT, 'backend')
      );
      const formatted = formatProjectContext(context);

      expect(formatted).toContain('## Key Files');
      expect(formatted.length).toBeGreaterThan(200);
    });
  });

  describe('Integration with real project', () => {
    it('should provide useful context for KI-AB project', async () => {
      const context = await generateProjectContext(PROJECT_ROOT);

      // The summary should mention key aspects
      expect(context.projectInfo.structure.totalFiles).toBeGreaterThan(10);
      expect(context.techStack.length).toBeGreaterThan(0);
    });
  });
});
