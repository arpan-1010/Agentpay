import { tool } from "ai";
import { z } from "zod";

// A tool = a description the LLM reads + a schema it must follow + code that runs.
// The model never runs code itself. It only asks us to run it.

export const calculator = tool({
  description: "Do basic math on two numbers. Use this for any arithmetic.",
  inputSchema: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ operation, a, b }) => {
    switch (operation) {
      case "add": return { result: a + b };
      case "subtract": return { result: a - b };
      case "multiply": return { result: a * b };
      case "divide":
        if (b === 0) return { error: "Division by zero" };
        return { result: a / b };
    }
  },
});

export const getTime = tool({
  description: "Get the current date and time, optionally in a given IANA timezone.",
  inputSchema: z.object({
    timezone: z.string().optional().describe("e.g. 'Asia/Kolkata' or 'UTC'"),
  }),
  execute: async ({ timezone }) => {
    try {
      const tz = timezone ?? "UTC";
      const formatted = new Intl.DateTimeFormat("en-GB", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: tz,
      }).format(new Date());
      return { timezone: tz, time: formatted };
    } catch {
      return { error: `Unknown timezone: ${timezone}` };
    }
  },
});

export const basicTools = { calculator, getTime };