#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";

function runTmux(args) {
  return execSync(`tmux ${args}`, { encoding: "utf-8" }).trim();
}

function runTmuxSafe(args) {
  try {
    return runTmux(args);
  } catch {
    return null;
  }
}

function ok(text) {
  return { content: [{ type: "text", text }] };
}

function err(text) {
  return { content: [{ type: "text", text }], isError: true };
}

function escapeForTmux(text) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}

const server = new McpServer({ name: "tmux", version: "1.0.0" });

server.tool(
  "list_sessions",
  "List all tmux sessions",
  {},
  async () => {
    const result = runTmuxSafe(
      'list-sessions -F "#{session_name}: #{session_windows} windows (created #{session_created_string})#{?session_attached, (attached),}"'
    );
    if (result === null) return ok("No tmux server running or no sessions.");
    return ok(result);
  }
);

server.tool(
  "read_pane",
  "Read the current visible content of a tmux pane. Use target to specify session:window.pane (e.g. 'mysession', 'mysession:0', 'mysession:0.1'). Omit target for the most recently active pane.",
  { target: z.string().optional(), lines: z.number().optional().default(200) },
  async ({ target, lines }) => {
    const t = target ? `-t ${JSON.stringify(target)}` : "";
    const result = runTmuxSafe(`capture-pane ${t} -p -S -${lines}`);
    if (result === null) return err("Failed to read pane. Check that the target exists.");
    return ok(result);
  }
);

server.tool(
  "send_keys",
  "Send keystrokes to a tmux pane. Keys are interpreted as tmux key names: Enter, C-c, C-d, Up, Down, Escape, Space, Tab, etc. For literal text, use send_text instead.",
  { target: z.string().optional(), keys: z.string() },
  async ({ target, keys }) => {
    const t = target ? `-t ${JSON.stringify(target)}` : "";
    try {
      runTmux(`send-keys ${t} ${keys}`);
      return ok(`Sent keys: ${keys}`);
    } catch (e) {
      return err(`Failed to send keys: ${e.message}`);
    }
  }
);

server.tool(
  "send_text",
  "Send literal text to a tmux pane. The text is sent exactly as provided (properly escaped). Set enter=true (default) to press Enter after the text.",
  { target: z.string().optional(), text: z.string(), enter: z.boolean().optional().default(true) },
  async ({ target, text, enter }) => {
    const t = target ? `-t ${JSON.stringify(target)}` : "";
    const escaped = escapeForTmux(text);
    try {
      runTmux(`send-keys ${t} -l "${escaped}"`);
      if (enter) {
        runTmux(`send-keys ${t} Enter`);
      }
      return ok(`Sent text${enter ? " + Enter" : ""}: ${text}`);
    } catch (e) {
      return err(`Failed to send text: ${e.message}`);
    }
  }
);

server.tool(
  "create_session",
  "Create a new tmux session. Optionally set working directory and initial command.",
  { name: z.string(), directory: z.string().optional(), command: z.string().optional() },
  async ({ name, directory, command }) => {
    const parts = ["new-session", "-d", "-s", JSON.stringify(name)];
    if (directory) parts.push("-c", JSON.stringify(directory));
    if (command) parts.push(JSON.stringify(command));
    try {
      runTmux(parts.join(" "));
      return ok(`Created session: ${name}`);
    } catch (e) {
      return err(`Failed to create session: ${e.message}`);
    }
  }
);

server.tool(
  "kill_session",
  "Kill a tmux session by name.",
  { name: z.string() },
  async ({ name }) => {
    try {
      runTmux(`kill-session -t ${JSON.stringify(name)}`);
      return ok(`Killed session: ${name}`);
    } catch (e) {
      return err(`Failed to kill session: ${e.message}`);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
