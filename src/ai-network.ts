import {
  State,
  type TextMessage,
  type ToolCallMessage,
  type ToolResultMessage,
  createAgent,
  createNetwork,
  openai,
} from "@inngest/agent-kit"
import type { Context } from "hono"
import type { HonoContext } from "."
import { createCalendarAgent } from "./agents/calendar"
import { createIdeasAgent } from "./agents/ideas"
import { createRouterAgent } from "./agents/router"
import type { inferenceMessagesTable, usersTable } from "./db/schema"

export function createAiNetwork({
  honoContext,
  user,
  inferenceMessages,
}: {
  honoContext: Context<HonoContext>
  user: typeof usersTable.$inferSelect
  inferenceMessages: (typeof inferenceMessagesTable.$inferSelect)[]
}) {
  const OPENAI_API_KEY = honoContext.env.OPENAI_API_KEY

  const executiveDirectorAgent = createAgent({
    name: "Executive Director agent",
    description:
      "Responds to general inquiries and acts as a helpful personal assistant, orchestrates the outputs of other agents and provides final responses to the user.",

    system: `You are a helpful executive assistant who can help with general inquiries and act as a helpful personal assistant. You orchestrate the actions of other agents and provide final responses to the user.

<response-format>
Use HTML tags for formatting in your responses. Supported tags: b, strong, i, em, u, ins, s, strike, del, span class="tg-spoiler", tg-spoiler, a href, tg-emoji, code, pre, blockquote. All <, > and & symbols that are not a part of a tag or an HTML entity must be replaced with the corresponding HTML entities (< with &lt;, > with &gt; and & with &amp;).
</response-format>`,
    model: openai({
      model: "gpt-4-turbo" as never,
      apiKey: OPENAI_API_KEY,
    }),
    lifecycle: {
      onStart: (args) => {
        const inferenceMessages = args.network?.state.kv.get(
          "inferenceMessages",
        ) as (typeof inferenceMessagesTable.$inferSelect)[] | undefined

        return {
          ...args,
          stop: false,
          history: args.history ?? [],
          prompt: [
            args.prompt[0]!, // System prompt goes first
            ...(inferenceMessages?.map((message) => {
              if (message.toolCallJson) {
                const toolCall = JSON.parse(message.toolCallJson)

                return {
                  role: "assistant",
                  type: "tool_call",
                  tools: [toolCall],
                  stop_reason: "tool",
                } satisfies ToolCallMessage
              }

              if (message.toolResultJson) {
                const toolResult = JSON.parse(message.toolResultJson)

                return {
                  role: "tool_result",
                  content: toolResult.content,
                  tool: toolResult.tool,
                  stop_reason: "tool",
                  type: "tool_result",
                } satisfies ToolResultMessage
              }

              return {
                role: message.role,
                type: "text",
                content: message.content!,
              } satisfies TextMessage
            }) ?? []),
            args.prompt[1]!,
          ],
        }
      },
      onFinish: ({ result }) => {
        result.withFormatter((result) => {
          return result.output.concat(result.toolCalls)
        })
        return result
      },
    },
  })

  const ideasAgent = createIdeasAgent({
    user,
    honoContext,
  })

  const calendarAgent = createCalendarAgent({
    user,
    honoContext,
  })

  const state = new State({
    inferenceMessages,
  })

  const network = createNetwork({
    name: "Project Aurora Network",
    agents: [executiveDirectorAgent, calendarAgent, ideasAgent],
    defaultRouter: createRouterAgent({
      honoContext,
    }),
    defaultState: state,
    maxIter: 5,
  })

  return network
}
