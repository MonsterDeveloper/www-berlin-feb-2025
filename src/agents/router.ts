import { createRoutingAgent, createTool, openai } from "@inngest/agent-kit"
import type { Context } from "hono"
import { z } from "zod"
import type { HonoContext } from ".."
import type { inferenceMessagesTable } from "../db/schema"

// This tool does nothing but ensure that the model responds with the
// agent name as valid JSON.
const selectAgentTool = createTool({
  name: "select_agent",
  description:
    "Select an agent to handle the input, based off of the current conversation",
  parameters: z
    .object({
      name: z
        .string()
        .describe("The name of the agent that should handle the request"),
    })
    .strict(),
  handler: (
    { name },
    { network }: { network?: { agents: Map<string, { name: string }> } },
  ) => {
    if (!network) {
      throw new Error(
        "The routing agent can only be used within a network of agents",
      )
    }

    if (typeof name !== "string") {
      throw new Error("The routing agent requested an invalid agent")
    }

    const agent = network.agents.get(name)
    if (agent === undefined) {
      throw new Error(
        `The routing agent requested an agent that doesn't exist: ${name}`,
      )
    }

    // This returns the agent name to call.  The default routing functon
    // schedules this agent by inpsecting this name via the tool call output.
    return agent.name
  },
})

export function createRouterAgent({
  honoContext,
}: {
  honoContext: Context<HonoContext>
}) {
  return createRoutingAgent({
    name: "Default routing agent",

    model: openai({
      model: "gpt-4o",
      apiKey: honoContext.env.OPENAI_API_KEY,
    }),

    description:
      "Selects which agents to work on based off of the current prompt and input.",

    lifecycle: {
      onRoute: ({ result }) => {
        const tool = result.toolCalls[0]
        if (!tool) {
          return
        }

        if (tool.tool.name === "done") {
          return
        }

        if (
          typeof tool.content === "object" &&
          tool.content !== null &&
          "data" in tool.content &&
          typeof tool.content.data === "string"
        ) {
          return [tool.content.data]
        }
        return
      },

      onStart: (args) => {
        const inferenceMessages = args.network?.state.kv.get(
          "inferenceMessages",
        ) as (typeof inferenceMessagesTable.$inferSelect)[] | undefined

        return {
          ...args,
          prompt: [
            args.prompt[0]!, // System prompt goes first
            {
              role: "user",
              type: "text",
              content: JSON.stringify([
                ...(inferenceMessages?.map((message) => {
                  if (message.toolCallJson) {
                    const toolCall = JSON.parse(message.toolCallJson)

                    return {
                      role: "assistant",
                      content: null,
                      tool_calls: [toolCall],
                    }
                  }

                  if (message.toolResultJson) {
                    const toolResult = JSON.parse(message.toolResultJson)

                    return {
                      role: "tool",
                      content: toolResult.content,
                      tool_call_id: toolResult.tool.id,
                    }
                  }

                  return {
                    role: message.role,
                    type: "text",
                    content: message.content,
                  }
                }) ?? []),
                args.prompt[1]!, // Current user prompt
                ...(args.history ?? []),
              ]),
            },
          ],
          history: [],
          stop: false,
        }
      },
    },

    tools: [
      selectAgentTool,
      createTool({
        name: "done",
        description:
          "Finalize the conversation when a message contains a final and formatted text response for the user.",
        // biome-ignore lint/suspicious/noEmptyBlockStatements: we're just using this as a signal
        handler: () => {},
      }),
    ],

    tool_choice: "any",

    system: async ({ network }): Promise<string> => {
      if (!network) {
        throw new Error(
          "The routing agent can only be used within a network of agents",
        )
      }

      const agents = await network?.availableAgents()

      return `You are the router orchestrating the requests between a group of agents. This agentic system is a personal AI assistant. Each agent is suited for a set of specific tasks, and has a name, instructions, and a set of tools.

The following agents are available:
<agents>
${agents
  .map((a) => {
    return `
  <agent>
    <name>${a.name}</name>
    <description>${a.description}</description>
    <tools>${JSON.stringify(Array.from(a.tools.values()))}</tools>
  </agent>`
  })
  .join("\n")}
</agents>

Follow these instructions:
<instructions>
You will be given a list of previous messages. Think about the current history and status. Determine which agent to use to handle the user's request, based off of the current agents and their tools.

Your aim is to thoroughly complete the request, thinking step by step, choosing the right agent based off of the context. The last message in the history should be a response shown to the end user.

If you think user's request is fulfilled and the last message contains text that is ready to be sent to the user, call the "done" function.
</instructions>`
    },
  })
}
