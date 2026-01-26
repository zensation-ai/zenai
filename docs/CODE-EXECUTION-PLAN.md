# Implementierungsplan: Code-Ausführung in KI-AB

> **Ziel**: Die KI-Anwendung soll wie Claude Code funktionieren - Prompts entgegennehmen, Code generieren und sicher ausführen.

---

## Übersicht der Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        BENUTZER                                  │
│                    "Berechne mir die Fibonacci-Zahlen bis 100"  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CHAT-INTERFACE                               │
│                  (GeneralChat.tsx)                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MODE DETECTION                                │
│         detectChatMode() → "tool_assisted" oder "agent"         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TOOL REGISTRY                               │
│              execute_code Tool wird ausgewählt                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CODE GENERATOR                                 │
│         Claude generiert Python/Node.js/Bash Code               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SAFETY VALIDATOR                               │
│        Prüft auf verbotene Imports, Systemzugriffe, etc.        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  SANDBOX EXECUTOR                                │
│              Docker Container mit Ressourcenlimits              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ERGEBNIS                                     │
│           stdout, stderr, exitCode → zurück an Chat             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Grundstruktur (Backend)

### 1.1 Neue Dateien erstellen

```
backend/src/services/code-execution/
  ├── index.ts                 # Export-Barrel
  ├── types.ts                 # TypeScript Interfaces
  ├── code-generator.ts        # Claude → Code
  ├── safety-validator.ts      # Sicherheitsprüfungen
  ├── sandbox-executor.ts      # Docker-Ausführung
  └── execution-tool.ts        # Tool-Definition & Handler
```

### 1.2 Types definieren

**Datei: `backend/src/services/code-execution/types.ts`**

```typescript
export type SupportedLanguage = 'python' | 'nodejs' | 'bash';

export interface CodeGenerationRequest {
  task: string;
  language: SupportedLanguage;
  context?: string;  // Zusätzlicher Kontext aus der Konversation
}

export interface GeneratedCode {
  code: string;
  language: SupportedLanguage;
  explanation: string;
  estimatedBehavior: string;
  requiredPackages: string[];
}

export interface ExecutionOptions {
  timeout: number;        // in Millisekunden
  memoryLimit: string;    // z.B. "256m"
  cpuLimit: string;       // z.B. "0.5"
  networkEnabled: boolean;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  truncated: boolean;     // Falls Output zu lang war
  error?: string;         // Systemic error (nicht Code-Fehler)
}

export interface SafetyCheckResult {
  safe: boolean;
  violations: string[];
  warnings: string[];
}

// Standardwerte
export const DEFAULT_EXECUTION_OPTIONS: ExecutionOptions = {
  timeout: 30000,         // 30 Sekunden
  memoryLimit: '256m',
  cpuLimit: '0.5',
  networkEnabled: false,
};

export const MAX_OUTPUT_LENGTH = 50000;  // 50KB max output
export const MAX_CODE_LENGTH = 20000;    // 20KB max code
```

---

## Phase 2: Code-Generator

### 2.1 Claude als Code-Generator

**Datei: `backend/src/services/code-execution/code-generator.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { CodeGenerationRequest, GeneratedCode, SupportedLanguage, MAX_CODE_LENGTH } from './types';

const SYSTEM_PROMPT = `Du bist ein Code-Generator. Deine Aufgabe ist es, ausführbaren Code zu generieren.

REGELN:
1. Generiere NUR den Code - keine Erklärungen im Code-Block
2. Der Code muss eigenständig lauffähig sein (keine fehlenden Imports)
3. Verwende NUR Standardbibliotheken oder explizit erlaubte Pakete
4. Füge Fehlerbehandlung hinzu
5. Der Code darf KEINE sensiblen Operationen ausführen:
   - Kein Dateisystem-Zugriff außer /tmp
   - Keine Netzwerk-Requests (außer explizit erlaubt)
   - Keine Systembefehle
   - Kein Zugriff auf Umgebungsvariablen

ERLAUBTE PYTHON-PAKETE:
- Standardbibliothek (math, json, datetime, collections, itertools, functools, re, random, statistics)
- numpy (falls benötigt)
- pandas (falls benötigt)

ERLAUBTE NODE.JS:
- Standardbibliothek (fs nur für /tmp, path, util, crypto)
- lodash (falls benötigt)

Antworte IMMER in diesem JSON-Format:
{
  "code": "der generierte Code",
  "explanation": "kurze Erklärung was der Code tut",
  "estimatedBehavior": "was der Code ausgeben wird",
  "requiredPackages": ["paket1", "paket2"]
}`;

const LANGUAGE_HINTS: Record<SupportedLanguage, string> = {
  python: 'Generiere Python 3.11 Code. Verwende f-strings und moderne Syntax.',
  nodejs: 'Generiere Node.js 20 Code (CommonJS). Verwende const/let, async/await.',
  bash: 'Generiere Bash-Skript. Verwende set -e am Anfang für Fehlerbehandlung.',
};

export class CodeGenerator {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: CodeGenerationRequest): Promise<GeneratedCode> {
    const userPrompt = `
AUFGABE: ${request.task}

SPRACHE: ${request.language}
${LANGUAGE_HINTS[request.language]}

${request.context ? `KONTEXT: ${request.context}` : ''}

Generiere jetzt den Code.`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Parse JSON-Antwort
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unerwarteter Response-Typ');
    }

    try {
      // Extrahiere JSON aus der Antwort (auch wenn in Markdown-Block)
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Kein JSON in der Antwort gefunden');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validierung
      if (!parsed.code || typeof parsed.code !== 'string') {
        throw new Error('Kein gültiger Code in der Antwort');
      }

      if (parsed.code.length > MAX_CODE_LENGTH) {
        throw new Error(`Code zu lang: ${parsed.code.length} > ${MAX_CODE_LENGTH}`);
      }

      return {
        code: parsed.code,
        language: request.language,
        explanation: parsed.explanation || 'Keine Erklärung verfügbar',
        estimatedBehavior: parsed.estimatedBehavior || 'Unbekannt',
        requiredPackages: parsed.requiredPackages || [],
      };
    } catch (error) {
      throw new Error(`Fehler beim Parsen der Code-Antwort: ${error}`);
    }
  }
}
```

---

## Phase 3: Sicherheits-Validator

### 3.1 Code-Prüfung vor Ausführung

**Datei: `backend/src/services/code-execution/safety-validator.ts`**

```typescript
import { SupportedLanguage, SafetyCheckResult } from './types';

// Verbotene Patterns pro Sprache
const FORBIDDEN_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  python: [
    /import\s+os(?:\s|$|\.)/,           // os module
    /import\s+subprocess/,               // subprocess
    /import\s+sys(?:\s|$)/,             // sys module
    /from\s+os\s+import/,
    /exec\s*\(/,                         // exec()
    /eval\s*\(/,                         // eval()
    /__import__/,                        // dynamic import
    /open\s*\([^)]*['"]\//,             // absolute path access
    /\.\.\/|\.\.\\|~\//,                // path traversal
    /import\s+socket/,                   // network
    /import\s+requests/,                 // HTTP (unless explicitly allowed)
    /import\s+urllib/,
    /import\s+shutil/,                   // file operations
    /import\s+glob/,
    /import\s+pathlib/,
    /compile\s*\(/,                      // code compilation
  ],
  nodejs: [
    /require\s*\(\s*['"]child_process['"]\s*\)/,
    /require\s*\(\s*['"]cluster['"]\s*\)/,
    /require\s*\(\s*['"]net['"]\s*\)/,
    /require\s*\(\s*['"]dgram['"]\s*\)/,
    /require\s*\(\s*['"]http['"]\s*\)/,
    /require\s*\(\s*['"]https['"]\s*\)/,
    /process\.env/,
    /process\.exit/,
    /eval\s*\(/,
    /Function\s*\(/,
    /\.\.\/|\.\.\\|~\//,                // path traversal
    /fs\.(readFile|writeFile|unlink|rmdir|mkdir).*['"]\//,  // absolute paths
  ],
  bash: [
    /curl\s/,
    /wget\s/,
    /nc\s|netcat\s/,
    /ssh\s/,
    /scp\s/,
    /rm\s+-rf?\s+\//,                   // dangerous rm
    /chmod\s/,
    /chown\s/,
    /sudo\s/,
    /su\s+-/,
    />\s*\/(?!tmp)/,                    // write outside /tmp
    /\/etc\//,
    /\/var\//,
    /\/home\//,
    /\$\(|`/,                           // command substitution (could be dangerous)
    /eval\s/,
    /source\s/,
    /\.\s+\//,                          // source command
  ],
};

// Warnungen (nicht verboten, aber suspicious)
const WARNING_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  python: [
    /while\s+True/,                     // infinite loop risk
    /import\s+time.*sleep/,             // could be slow
    /open\s*\(/,                        // file operations
  ],
  nodejs: [
    /while\s*\(\s*true\s*\)/,
    /setInterval/,
    /fs\./,
  ],
  bash: [
    /while\s+true/,
    /sleep\s/,
  ],
};

export function validateCode(code: string, language: SupportedLanguage): SafetyCheckResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  // Prüfe verbotene Patterns
  const forbidden = FORBIDDEN_PATTERNS[language];
  for (const pattern of forbidden) {
    if (pattern.test(code)) {
      violations.push(`Verbotenes Pattern gefunden: ${pattern.source}`);
    }
  }

  // Prüfe Warnungen
  const warningPatterns = WARNING_PATTERNS[language];
  for (const pattern of warningPatterns) {
    if (pattern.test(code)) {
      warnings.push(`Potenziell problematisch: ${pattern.source}`);
    }
  }

  // Zusätzliche Checks
  if (code.length > 10000) {
    warnings.push('Code ist sehr lang (>10KB)');
  }

  const lineCount = code.split('\n').length;
  if (lineCount > 500) {
    warnings.push(`Viele Zeilen (${lineCount}) - könnte lange dauern`);
  }

  return {
    safe: violations.length === 0,
    violations,
    warnings,
  };
}

// Export für Tests
export const FORBIDDEN_PATTERNS_EXPORT = FORBIDDEN_PATTERNS;
```

---

## Phase 4: Sandbox-Executor (Docker)

### 4.1 Docker-basierte Ausführung

**Datei: `backend/src/services/code-execution/sandbox-executor.ts`**

```typescript
import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  SupportedLanguage,
  ExecutionOptions,
  ExecutionResult,
  DEFAULT_EXECUTION_OPTIONS,
  MAX_OUTPUT_LENGTH,
} from './types';

const DOCKER_IMAGES: Record<SupportedLanguage, string> = {
  python: 'python:3.11-slim',
  nodejs: 'node:20-slim',
  bash: 'alpine:latest',
};

const FILE_EXTENSIONS: Record<SupportedLanguage, string> = {
  python: '.py',
  nodejs: '.js',
  bash: '.sh',
};

const EXECUTION_COMMANDS: Record<SupportedLanguage, string[]> = {
  python: ['python', '/code/script.py'],
  nodejs: ['node', '/code/script.js'],
  bash: ['sh', '/code/script.sh'],
};

export class SandboxExecutor {
  private tempDir: string;

  constructor(tempDir: string = '/tmp/code-sandbox') {
    this.tempDir = tempDir;
  }

  async execute(
    code: string,
    language: SupportedLanguage,
    options: Partial<ExecutionOptions> = {}
  ): Promise<ExecutionResult> {
    const opts: ExecutionOptions = { ...DEFAULT_EXECUTION_OPTIONS, ...options };
    const executionId = randomUUID();
    const codeDir = join(this.tempDir, executionId);
    const codeFile = join(codeDir, `script${FILE_EXTENSIONS[language]}`);

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let exitCode = -1;
    let error: string | undefined;

    try {
      // Erstelle temporäres Verzeichnis und Code-Datei
      await mkdir(codeDir, { recursive: true });
      await writeFile(codeFile, code, 'utf-8');

      // Docker-Befehl zusammenbauen
      const dockerArgs = this.buildDockerArgs(
        codeDir,
        language,
        opts,
        executionId
      );

      // Ausführung
      const result = await this.runDocker(dockerArgs, opts.timeout);
      stdout = result.stdout;
      stderr = result.stderr;
      exitCode = result.exitCode;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (error.includes('timeout')) {
        stderr = 'Ausführung abgebrochen: Timeout erreicht';
        exitCode = 124;  // Standard timeout exit code
      }
    } finally {
      // Cleanup
      await this.cleanup(codeDir, executionId);
    }

    const executionTimeMs = Date.now() - startTime;

    // Truncate output if too long
    let truncated = false;
    if (stdout.length > MAX_OUTPUT_LENGTH) {
      stdout = stdout.slice(0, MAX_OUTPUT_LENGTH) + '\n... (Output gekürzt)';
      truncated = true;
    }
    if (stderr.length > MAX_OUTPUT_LENGTH) {
      stderr = stderr.slice(0, MAX_OUTPUT_LENGTH) + '\n... (Fehler gekürzt)';
      truncated = true;
    }

    return {
      success: exitCode === 0,
      stdout,
      stderr,
      exitCode,
      executionTimeMs,
      truncated,
      error,
    };
  }

  private buildDockerArgs(
    codeDir: string,
    language: SupportedLanguage,
    options: ExecutionOptions,
    executionId: string
  ): string[] {
    const image = DOCKER_IMAGES[language];
    const command = EXECUTION_COMMANDS[language];

    const args = [
      'run',
      '--rm',                                    // Container nach Ausführung löschen
      '--name', `sandbox-${executionId}`,        // Eindeutiger Name
      '-v', `${codeDir}:/code:ro`,               // Code-Verzeichnis (read-only)
      '--memory', options.memoryLimit,           // RAM-Limit
      '--cpus', options.cpuLimit,                // CPU-Limit
      '--pids-limit', '50',                      // Max Prozesse
      '--read-only',                             // Read-only Root-Filesystem
      '--tmpfs', '/tmp:size=64m',                // Temp-Verzeichnis im RAM
      '--security-opt', 'no-new-privileges',     // Keine Privilege Escalation
      '--cap-drop', 'ALL',                       // Alle Capabilities entfernen
    ];

    // Netzwerk-Isolation
    if (!options.networkEnabled) {
      args.push('--network', 'none');
    }

    // Image und Befehl
    args.push(image, ...command);

    return args;
  }

  private runDocker(args: string[], timeout: number): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    return new Promise((resolve, reject) => {
      const process = spawn('docker', args);

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Timeout
      const timer = setTimeout(() => {
        killed = true;
        process.kill('SIGKILL');
        // Container stoppen falls noch läuft
        const containerName = args.find((_, i) => args[i - 1] === '--name');
        if (containerName) {
          spawn('docker', ['kill', containerName]);
        }
        reject(new Error('timeout'));
      }, timeout);

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        clearTimeout(timer);
        if (!killed) {
          resolve({
            stdout,
            stderr,
            exitCode: code ?? -1,
          });
        }
      });

      process.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private async cleanup(codeDir: string, executionId: string): Promise<void> {
    try {
      // Container stoppen falls noch läuft
      spawn('docker', ['rm', '-f', `sandbox-${executionId}`]);

      // Temporäre Dateien löschen
      await unlink(join(codeDir, 'script.py')).catch(() => {});
      await unlink(join(codeDir, 'script.js')).catch(() => {});
      await unlink(join(codeDir, 'script.sh')).catch(() => {});

      // Verzeichnis löschen
      await unlink(codeDir).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }

  // Health Check: Ist Docker verfügbar?
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('docker', ['info']);
      process.on('close', (code) => resolve(code === 0));
      process.on('error', () => resolve(false));
    });
  }
}
```

---

## Phase 5: Tool-Integration

### 5.1 Tool-Definition und Handler

**Datei: `backend/src/services/code-execution/execution-tool.ts`**

```typescript
import { ToolDefinition, ToolExecutionContext } from '../claude/tool-use';
import { CodeGenerator } from './code-generator';
import { validateCode } from './safety-validator';
import { SandboxExecutor } from './sandbox-executor';
import { SupportedLanguage } from './types';

export const TOOL_EXECUTE_CODE: ToolDefinition = {
  name: 'execute_code',
  description: `Generiert und führt Code sicher in einer Sandbox aus.
Verwende dieses Tool wenn der Benutzer:
- Berechnungen durchführen möchte
- Daten verarbeiten oder transformieren möchte
- Algorithmen ausprobieren möchte
- Programmieraufgaben lösen möchte

WICHTIG: Der Code wird in einer isolierten Umgebung ausgeführt ohne Netzwerk- oder Dateisystemzugriff.`,
  input_schema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Beschreibung der Aufgabe, die der Code erfüllen soll',
      },
      language: {
        type: 'string',
        enum: ['python', 'nodejs', 'bash'],
        description: 'Programmiersprache (python empfohlen für Berechnungen)',
      },
      context: {
        type: 'string',
        description: 'Optionaler zusätzlicher Kontext oder Anforderungen',
      },
    },
    required: ['task', 'language'],
  },
};

export function createExecuteCodeHandler(
  anthropicApiKey: string,
  tempDir?: string
) {
  const generator = new CodeGenerator(anthropicApiKey);
  const executor = new SandboxExecutor(tempDir);

  return async (
    input: { task: string; language: SupportedLanguage; context?: string },
    context: ToolExecutionContext
  ): Promise<string> => {
    try {
      // 1. Prüfe ob Docker verfügbar ist
      const dockerAvailable = await executor.isAvailable();
      if (!dockerAvailable) {
        return JSON.stringify({
          success: false,
          error: 'Code-Ausführung nicht verfügbar (Docker nicht erreichbar)',
        });
      }

      // 2. Code generieren
      const generated = await generator.generate({
        task: input.task,
        language: input.language,
        context: input.context,
      });

      // 3. Sicherheitsprüfung
      const safetyCheck = validateCode(generated.code, input.language);
      if (!safetyCheck.safe) {
        return JSON.stringify({
          success: false,
          error: 'Code hat Sicherheitsprüfung nicht bestanden',
          violations: safetyCheck.violations,
          generatedCode: generated.code,
        });
      }

      // 4. Code ausführen
      const result = await executor.execute(generated.code, input.language);

      // 5. Ergebnis formatieren
      return JSON.stringify({
        success: result.success,
        code: generated.code,
        language: input.language,
        explanation: generated.explanation,
        output: result.stdout,
        errors: result.stderr,
        exitCode: result.exitCode,
        executionTimeMs: result.executionTimeMs,
        warnings: safetyCheck.warnings,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
```

### 5.2 Tool registrieren

**In `backend/src/services/tool-handlers.ts` hinzufügen:**

```typescript
import { TOOL_EXECUTE_CODE, createExecuteCodeHandler } from './code-execution/execution-tool';

// In registerAllToolHandlers():
export function registerAllToolHandlers(
  toolRegistry: ToolRegistry,
  services: ToolServices
): void {
  // ... bestehende Tools ...

  // Code Execution Tool
  if (process.env.ENABLE_CODE_EXECUTION === 'true') {
    toolRegistry.register(
      TOOL_EXECUTE_CODE,
      createExecuteCodeHandler(
        process.env.ANTHROPIC_API_KEY!,
        process.env.CODE_SANDBOX_DIR || '/tmp/code-sandbox'
      )
    );
  }
}
```

---

## Phase 6: Mode Detection erweitern

### 6.1 Patterns für Code-Ausführung

**In `backend/src/services/chat-modes.ts` hinzufügen:**

```typescript
// Neue Patterns für Code-Ausführung
const CODE_EXECUTION_PATTERNS = [
  /berechne|kalkuliere|rechne.*aus/i,
  /führe.*code.*aus/i,
  /schreib.*(?:ein|mir).*(?:skript|programm|code)/i,
  /generiere.*code/i,
  /programmier.*mir/i,
  /erstell.*(?:skript|programm)/i,
  /python.*(?:code|skript)/i,
  /javascript.*(?:code|skript)/i,
  /bash.*(?:skript|befehl)/i,
  /implementier/i,
  /algorithm/i,
  /sortier.*(?:daten|liste|array)/i,
  /parse|verarbeite.*(?:daten|json|csv)/i,
  /konvertier/i,
  /transformier/i,
];

// In detectChatMode():
function detectChatMode(message: string): ChatModeResult {
  // ... bestehende Logik ...

  // Code-Ausführung prüfen
  const codeMatch = CODE_EXECUTION_PATTERNS.some(p => p.test(message));
  if (codeMatch) {
    return {
      mode: 'tool_assisted',
      confidence: 0.9,
      suggestedTools: ['execute_code'],
      reasoning: 'Code-Ausführung erkannt',
    };
  }

  // ... rest ...
}
```

---

## Phase 7: Frontend-Anpassungen

### 7.1 Code-Anzeige-Komponente

**Neue Datei: `frontend/src/components/CodeExecutionResult.tsx`**

```tsx
import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeExecutionResultProps {
  code: string;
  language: string;
  output: string;
  errors?: string;
  executionTimeMs: number;
  success: boolean;
}

export const CodeExecutionResult: React.FC<CodeExecutionResultProps> = ({
  code,
  language,
  output,
  errors,
  executionTimeMs,
  success,
}) => {
  return (
    <div className="code-execution-result">
      {/* Code-Block */}
      <div className="code-section">
        <div className="code-header">
          <span className="language-badge">{language}</span>
          <span className="execution-time">{executionTimeMs}ms</span>
        </div>
        <SyntaxHighlighter
          language={language === 'nodejs' ? 'javascript' : language}
          style={vscDarkPlus}
          customStyle={{ margin: 0, borderRadius: '0 0 8px 8px' }}
        >
          {code}
        </SyntaxHighlighter>
      </div>

      {/* Output */}
      <div className={`output-section ${success ? 'success' : 'error'}`}>
        <div className="output-header">
          {success ? '✓ Ausgabe' : '✗ Fehler'}
        </div>
        <pre className="output-content">
          {output || errors || '(keine Ausgabe)'}
        </pre>
      </div>
    </div>
  );
};
```

### 7.2 CSS für Code-Anzeige

**In `frontend/src/styles/code-execution.css`:**

```css
.code-execution-result {
  margin: 1rem 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color, #e0e0e0);
}

.code-section {
  background: #1e1e1e;
}

.code-header {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: #2d2d2d;
  color: #fff;
  font-size: 0.85rem;
}

.language-badge {
  background: #0078d4;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-weight: 500;
}

.execution-time {
  color: #888;
}

.output-section {
  padding: 1rem;
}

.output-section.success {
  background: #f0fff0;
  border-top: 2px solid #28a745;
}

.output-section.error {
  background: #fff0f0;
  border-top: 2px solid #dc3545;
}

.output-header {
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.output-content {
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
}
```

---

## Phase 8: Railway-Deployment

### 8.1 Docker-in-Docker aktivieren

Railway unterstützt kein echtes Docker-in-Docker. **Alternative Strategien:**

#### Option A: Externe Code-Ausführungs-API (Empfohlen)

```typescript
// Nutze einen externen Service wie:
// - Judge0 API (selbst gehostet oder gehostet)
// - Piston API
// - Repl.it API

// backend/src/services/code-execution/external-executor.ts
export class ExternalExecutor {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  async execute(code: string, language: string): Promise<ExecutionResult> {
    const response = await fetch(`${this.apiUrl}/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': this.apiKey,
      },
      body: JSON.stringify({
        source_code: Buffer.from(code).toString('base64'),
        language_id: this.getLanguageId(language),
        stdin: '',
        cpu_time_limit: 5,
        memory_limit: 256000,
      }),
    });

    // ... Response verarbeiten ...
  }
}
```

#### Option B: Lokale Entwicklung + Production ohne Code-Execution

```typescript
// Umgebungsvariable prüfen
if (process.env.ENABLE_CODE_EXECUTION === 'true' && process.env.NODE_ENV !== 'production') {
  // Nur lokal aktivieren
}
```

#### Option C: Railway mit Docker-Build

```dockerfile
# Dockerfile.sandbox
FROM docker:dind

# Node.js installieren
RUN apk add --no-cache nodejs npm

# App kopieren und starten
COPY . /app
WORKDIR /app
RUN npm install

CMD ["sh", "-c", "dockerd & npm start"]
```

### 8.2 Umgebungsvariablen

```bash
# Railway Environment
ENABLE_CODE_EXECUTION=true
CODE_SANDBOX_DIR=/tmp/code-sandbox
CODE_EXECUTION_TIMEOUT=30000
CODE_EXECUTION_MEMORY_LIMIT=256m

# Falls externe API verwendet wird
CODE_EXECUTION_API_URL=https://judge0-api.example.com
CODE_EXECUTION_API_KEY=xxx
```

---

## Phase 9: Tests

### 9.1 Unit Tests

**Datei: `backend/src/__tests__/code-execution/safety-validator.test.ts`**

```typescript
import { validateCode } from '../../services/code-execution/safety-validator';

describe('SafetyValidator', () => {
  describe('Python', () => {
    it('should block os import', () => {
      const result = validateCode('import os\nos.system("ls")', 'python');
      expect(result.safe).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should allow math operations', () => {
      const result = validateCode('import math\nprint(math.sqrt(16))', 'python');
      expect(result.safe).toBe(true);
    });

    it('should block subprocess', () => {
      const result = validateCode('import subprocess', 'python');
      expect(result.safe).toBe(false);
    });

    it('should block eval', () => {
      const result = validateCode('eval("print(1)")', 'python');
      expect(result.safe).toBe(false);
    });
  });

  describe('NodeJS', () => {
    it('should block child_process', () => {
      const result = validateCode('const cp = require("child_process")', 'nodejs');
      expect(result.safe).toBe(false);
    });

    it('should allow basic operations', () => {
      const result = validateCode('console.log(1 + 1)', 'nodejs');
      expect(result.safe).toBe(true);
    });
  });

  describe('Bash', () => {
    it('should block curl', () => {
      const result = validateCode('curl http://evil.com', 'bash');
      expect(result.safe).toBe(false);
    });

    it('should block dangerous rm', () => {
      const result = validateCode('rm -rf /', 'bash');
      expect(result.safe).toBe(false);
    });
  });
});
```

### 9.2 Integration Tests

**Datei: `backend/src/__tests__/code-execution/sandbox-executor.test.ts`**

```typescript
import { SandboxExecutor } from '../../services/code-execution/sandbox-executor';

describe('SandboxExecutor', () => {
  const executor = new SandboxExecutor();

  // Skip wenn Docker nicht verfügbar
  beforeAll(async () => {
    const available = await executor.isAvailable();
    if (!available) {
      console.warn('Docker nicht verfügbar - Tests übersprungen');
    }
  });

  it('should execute simple Python code', async () => {
    const result = await executor.execute(
      'print("Hello, World!")',
      'python'
    );
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('Hello, World!');
  });

  it('should respect timeout', async () => {
    const result = await executor.execute(
      'import time\ntime.sleep(60)',
      'python',
      { timeout: 1000 }
    );
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(124);
  });

  it('should isolate network', async () => {
    const result = await executor.execute(
      'import urllib.request\nurllib.request.urlopen("http://google.com")',
      'python'
    );
    expect(result.success).toBe(false);
  });
});
```

---

## Phase 10: Checkliste für Implementierung

### Lokale Entwicklung (am Rechner)

- [ ] Docker installiert und läuft
- [ ] `backend/src/services/code-execution/` Verzeichnis erstellen
- [ ] `types.ts` implementieren
- [ ] `safety-validator.ts` implementieren + Tests
- [ ] `code-generator.ts` implementieren
- [ ] `sandbox-executor.ts` implementieren + Tests
- [ ] `execution-tool.ts` implementieren
- [ ] Tool in `tool-handlers.ts` registrieren
- [ ] Mode Detection erweitern
- [ ] Frontend `CodeExecutionResult.tsx` erstellen
- [ ] Lokale Tests durchführen

### Production-Deployment

- [ ] Entscheidung: Docker-in-Docker vs. externe API
- [ ] Falls externe API: Judge0 oder Piston aufsetzen
- [ ] Railway-Konfiguration anpassen
- [ ] Umgebungsvariablen setzen
- [ ] Staging-Tests
- [ ] Production-Deployment
- [ ] Monitoring einrichten

---

## Zusammenfassung

| Komponente | Aufwand | Priorität |
|------------|---------|-----------|
| Safety Validator | Niedrig | Kritisch |
| Code Generator | Niedrig | Hoch |
| Sandbox Executor | Mittel | Hoch |
| Tool Integration | Niedrig | Hoch |
| Frontend UI | Niedrig | Mittel |
| Railway Setup | Mittel | Hoch |
| Tests | Mittel | Hoch |

**Empfohlene Reihenfolge:**
1. Safety Validator (mit Tests) - schneller Erfolg
2. Code Generator - Claude macht die Arbeit
3. Lokale Sandbox (Docker) - zum Testen
4. Tool Integration - alles zusammenführen
5. Frontend UI - Ergebnisse anzeigen
6. Production Setup - Railway/externe API
