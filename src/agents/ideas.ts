import { createAgent, createTool, openai } from "@inngest/agent-kit"
import { and, eq } from "drizzle-orm"
import type { Context } from "hono"
import { z } from "zod"
import type { HonoContext } from ".."
import { ideaFoldersTable, ideasTable, type usersTable } from "../db/schema"

export function createIdeasAgent({
  user,
  honoContext,
}: {
  honoContext: Context<HonoContext>
  user: typeof usersTable.$inferSelect
}) {
  const database = honoContext.get("database")
  const OPENAI_API_KEY = honoContext.env.OPENAI_API_KEY

  const getFoldersTool = createTool({
    name: "get_folders",
    description: "Returns all of the user's folders",
    handler: async () => {
      if (!user) {
        return
      }

      return await database.query.ideaFoldersTable.findMany({
        where: eq(ideaFoldersTable.userId, user.id),
        columns: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    },
  })

  const getIdeasTool = createTool({
    name: "get_ideas",
    description: "Returns all of the user's ideas",
    handler: async () => {
      if (!user) {
        return
      }

      return await database.query.ideasTable.findMany({
        where: eq(ideasTable.userId, user.id),
        with: {
          folder: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
        columns: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    },
  })

  const getIdeaByIdTool = createTool({
    name: "get_idea_by_id",
    description: "Returns a single idea by its ID",
    parameters: z
      .object({
        id: z.string().describe("The ID of the idea to retrieve"),
      })
      .strict(),
    handler: async ({ id }) => {
      if (!user) {
        return
      }

      return await database.query.ideasTable.findFirst({
        where: and(eq(ideasTable.userId, user.id), eq(ideasTable.id, id)),
        with: {
          folder: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
        columns: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    },
  })

  const createIdeaTool = createTool({
    name: "create_idea",
    description: "Creates a new idea",
    parameters: z
      .object({
        name: z.string().describe("The name of the idea"),
        description: z
          .string()
          .nullable()
          .describe("A detailed description of the idea"),
        folderId: z
          .string()
          .nullable()
          .describe("The ID of the folder to assign the idea to"),
      })
      .strict(),
    handler: async ({ name, description, folderId }) => {
      if (!user) {
        return
      }

      const folder = folderId
        ? await database.query.ideaFoldersTable.findFirst({
            where: and(
              eq(ideaFoldersTable.userId, user.id),
              eq(ideaFoldersTable.id, folderId),
            ),
          })
        : null

      if (folderId && !folder) {
        return {
          error: "Folder not found",
        }
      }

      return await database.insert(ideasTable).values({
        userId: user.id,
        folderId: folder?.id,
        name,
        description,
      })
    },
  })

  return createAgent({
    name: "Ideas agent",
    model: openai({
      model: "gpt-4o-mini",
      apiKey: OPENAI_API_KEY,
    }),
    tools: [getFoldersTool, getIdeasTool, getIdeaByIdTool, createIdeaTool],
    description:
      "An agent that manages the user's ideas. It can perform CRUD operations on the ideas and their folders.",
    system: `You are a helpful assistant who manages the user's ideas. You can perform actions on the ideas and folders.`,
    lifecycle: {
      onFinish: ({ result }) => {
        result.withFormatter((result) => {
          if (result.raw === "") {
            // There is no call to the agent, so ignore this.
            return []
          }

          // Return the default format, which turns all system prompts into assistant
          // prompts.
          const agent = result.agent

          const messages = result.prompt
            .map((msg) => {
              if (msg.type !== "text" || msg.role === "user") {
                return
              }

              let content = ""
              if (typeof msg.content === "string") {
                content = msg.content
              } else if (Array.isArray(msg.content)) {
                content = msg.content.map((m) => m.text).join("\n")
              }

              // Ensure that system prompts are always as an assistant in history
              return {
                ...msg,
                type: "text",
                role: "assistant",
                content: `<agent>${agent.name}</agent>\n${content}`,
              }
            })
            .filter(Boolean)

          // return (messages as Message[])
          //   .concat(result.output)
          //   .concat(result.toolCalls)

          return result.output.concat(result.toolCalls)
        })

        return result
      },
    },
  })
}
