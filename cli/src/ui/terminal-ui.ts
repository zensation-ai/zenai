/**
 * Terminal UI (Phase 132)
 *
 * Handles terminal output formatting: colored text, spinners,
 * tool activity display, and markdown rendering.
 *
 * Uses chalk (CJS-compatible v4) for colors.
 *
 * @module cli/ui/terminal-ui
 */

import chalk from 'chalk';

// ─── Display Functions ───────────────────────────────────────────────────────

export function displayWelcome(projectType?: string): void {
  console.log();
  console.log(chalk.bold.cyan('  ZenAI CLI Agent'));
  console.log(chalk.dim('  Your AI assistant with persistent memory'));
  if (projectType) {
    console.log(chalk.dim(`  Project: ${projectType}`));
  }
  console.log(chalk.dim('  Type "exit" or Ctrl+C to quit, "/clear" to reset'));
  console.log();
}

export function displayResponse(text: string): void {
  console.log();
  console.log(formatMarkdown(text));
  console.log();
}

export function displayToolActivity(name: string, isStart: boolean): void {
  if (isStart) {
    process.stdout.write(chalk.dim(`  ⟳ ${name}...`));
  } else {
    process.stdout.write(chalk.dim(' ✓\n'));
  }
}

export function displayToolError(name: string, error: string): void {
  console.log(chalk.red(`  ✗ ${name}: ${error}`));
}

export function displayError(message: string): void {
  console.log(chalk.red(`\n  Error: ${message}\n`));
}

export function displayInfo(message: string): void {
  console.log(chalk.dim(`  ${message}`));
}

export function displayWarning(message: string): void {
  console.log(chalk.yellow(`  ⚠ ${message}`));
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

export function getPromptPrefix(): string {
  return chalk.green('❯ ');
}

// ─── Markdown Formatting ─────────────────────────────────────────────────────

function formatMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, chalk.bold('$1'))
    // Inline code
    .replace(/`([^`]+)`/g, chalk.cyan('$1'))
    // Headers
    .replace(/^### (.+)$/gm, chalk.bold.yellow('  $1'))
    .replace(/^## (.+)$/gm, chalk.bold.yellow('\n  $1'))
    .replace(/^# (.+)$/gm, chalk.bold.cyan('\n  $1'))
    // Bullet lists
    .replace(/^[-*] (.+)$/gm, chalk.dim('  • ') + '$1')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, (_, content) => chalk.dim('  ') + content)
    // Code blocks (simple — just indent and color)
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_, code: string) => {
      return code
        .split('\n')
        .map((line: string) => chalk.dim('  │ ') + chalk.cyan(line))
        .join('\n');
    });
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex % this.frames.length];
      process.stdout.write(`\r${chalk.cyan(frame)} ${chalk.dim(this.message)}`);
      this.frameIndex++;
    }, 80);
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write('\r' + ' '.repeat(this.message.length + 10) + '\r');
    if (finalMessage) {
      console.log(chalk.dim(`  ${finalMessage}`));
    }
  }

  update(message: string): void {
    this.message = message;
  }
}
