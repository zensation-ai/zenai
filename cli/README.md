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

## Part of ZenAI

This CLI lives in the [ZenAI](https://github.com/zensation-ai/zenai) monorepo and builds on the same neuroscience-inspired memory system published as [`@zensation/core`](https://www.npmjs.com/package/@zensation/core) and [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms).

## License

Apache 2.0 — see [LICENSE](./LICENSE).
