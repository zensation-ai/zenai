# @zensation/cli

> ZenAI CLI Agent — a terminal AI assistant with filesystem tools and, optionally, ZenAI's persistent memory and knowledge graph.

[![npm](https://img.shields.io/npm/v/@zensation/cli)](https://www.npmjs.com/package/@zensation/cli)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)

`zenai` is a terminal agent in the spirit of Claude Code: it runs an agentic loop over Claude with a set of filesystem tools, so you can read, search, and reason over a project from the command line. When pointed at a running [ZenAI](https://github.com/zensation-ai/zenai) backend it additionally gains persistent memory and knowledge-graph tools; without one, it runs in local-only mode.

## Install

```bash
npm install -g @zensation/cli
```

Or run it without installing:

```bash
npx @zensation/cli "summarize the TypeScript files in this folder"
```

## Quick start

```bash
export ANTHROPIC_API_KEY=sk-ant-...      # required

# Interactive REPL
zenai

# One-shot question
zenai "what does src/index.ts do?"
```

## Usage

```
zenai                     Interactive REPL mode
zenai "your question"     One-shot mode
zenai --help              Show help
zenai --version           Show version
```

In the REPL:

| Command | Description |
|---------|-------------|
| `/status` | Show backend connection, tool count, project, and session |
| `/clear`  | Clear the conversation history |
| `/exit` (or `exit`) | Exit |

## Configuration

All configuration is via environment variables:

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `ANTHROPIC_API_KEY` | yes | — | Claude API key |
| `ZENAI_MODEL` | no | `claude-sonnet-4-20250514` | Claude model to use |
| `ZENAI_MAX_TOKENS` | no | `4096` | Maximum response tokens |
| `ZENAI_MAX_ITERATIONS` | no | `25` | Maximum agent-loop iterations |
| `ZENAI_BACKEND_URL` | no | — | ZenAI backend URL (enables memory + knowledge-graph tools) |
| `ZENAI_BACKEND_API_KEY` | no | — | ZenAI backend API key |

## Memory & knowledge graph (optional)

Set `ZENAI_BACKEND_URL` (and `ZENAI_BACKEND_API_KEY`) to connect to a running ZenAI backend. The agent then gains tools backed by ZenAI's 7-layer memory and knowledge graph, so context persists across sessions. If no backend is reachable, `zenai` reports *local-only mode* and runs with the filesystem tools alone.

## Requirements

Node.js 22 or newer. Earlier versions cannot load this package: two of its dependencies ship
as ES modules, and `require()` of an ES module only exists from Node 20.19 / 22.12 onwards.
Versions up to 0.1.3 declared `>=18`, which was not achievable — 0.2.0 corrects the floor.

## Part of ZenAI

This CLI lives in the [ZenAI](https://github.com/zensation-ai/zenai) monorepo and builds on the
same neuroscience-inspired memory system that ZenBrain publishes as standalone packages.
Lab: [zensation.ai](https://zensation.ai) · open-source@zensation.ai

## About ZenBrain

ZenBrain is a seven-layer, neuroscience-derived memory architecture for LLM agents, built as
zero-dependency TypeScript and published under Apache-2.0. On LongMemEval-500 it wins all nine
head-to-head answer-quality comparisons against Letta, Mem0 and A-Mem (three competitors x three
LLM judges, Bonferroni-corrected), reaching 91.3% of a full-context oracle's binary-judge
accuracy at 1/106th of the per-query token cost.

- Source and issues: [github.com/zensation-ai/zenbrain](https://github.com/zensation-ai/zenbrain)
- Paper: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878) · Open-access archive: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663)
- Try it in the browser: [zensation.ai/en/playground](https://zensation.ai/en/playground)
- Packages: [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) · [`@zensation/core`](https://www.npmjs.com/package/@zensation/core) · [`@zensation/adapter-postgres`](https://www.npmjs.com/package/@zensation/adapter-postgres) · [`@zensation/adapter-sqlite`](https://www.npmjs.com/package/@zensation/adapter-sqlite) · [`@zensation/mcp`](https://www.npmjs.com/package/@zensation/mcp) · [`@zensation/ai-sdk`](https://www.npmjs.com/package/@zensation/ai-sdk)

## License

Apache 2.0 — see [LICENSE](./LICENSE).
