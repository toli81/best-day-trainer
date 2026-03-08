import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("ANTHROPIC_API_KEY is not set. Claude features will not work.");
}

export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export const CLAUDE_MODEL = "claude-sonnet-4-6";
