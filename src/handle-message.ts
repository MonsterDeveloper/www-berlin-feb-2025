import { desc, eq } from "drizzle-orm"
import { NonRetriableError } from "inngest"
import { createAiNetwork } from "./ai-network"
import { inferenceMessagesTable, messagesTable, usersTable } from "./db/schema"
import { inngest } from "./inngest"

export const handleMessage = inngest.createFunction(
  {
    id: "handle-message",
    retries: 0,
  },
  {
    event: "message.received",
  },
  async ({
    event: {
      data: { message },
    },
    honoContext,
    step,
  }) => {
    const bot = honoContext.get("bot")
    const database = honoContext.get("database")
    const googleOAuthClient = honoContext.get("googleOAuthClient")

    if (message.chat.type !== "private") {
      throw new NonRetriableError("Message is not from a private chat")
    }

    const user = await step.run("get-user", () =>
      database.query.usersTable.findFirst({
        where: eq(usersTable.id, String(message.chat.id)),
      }),
    )

    if (!user) {
      throw new NonRetriableError("User not found")
    }

    await step.run("send-chat-action", () =>
      bot.api.sendChatAction(message.chat.id, "typing"),
    )

    googleOAuthClient.setTokens({
      accessToken: user.googleAccessToken ?? undefined,
      accessTokenExpiresAt: user.googleAccessTokenExpiresAt
        ? new Date(user.googleAccessTokenExpiresAt)
        : undefined,
      refreshToken: user.googleRefreshToken ?? undefined,
    })

    googleOAuthClient.addEventListener("tokenUpdate", async ({ detail }) => {
      await database.update(usersTable).set({
        googleAccessToken: detail.accessToken,
        googleRefreshToken: detail.refreshToken,
        googleAccessTokenExpiresAt: detail.accessTokenExpiresAt,
      })
    })

    const inferenceMessages = await step.run(
      "get-inference-messages",
      async () => {
        const messages = await database.query.messagesTable.findMany({
          where: eq(messagesTable.userId, user.id),
          limit: 5,
          orderBy: desc(messagesTable.createdAt),
          with: {
            inferenceMessages: {
              orderBy: [
                desc(inferenceMessagesTable.createdAt),
                desc(inferenceMessagesTable.order),
              ],
            },
          },
        })

        return messages
          .flatMap((message) => message.inferenceMessages)
          .reverse()
      },
    )

    const network = createAiNetwork({
      honoContext,
      user: user as never,
      inferenceMessages: inferenceMessages as never,
    })

    const text = await step.run("get-message-text", async () => {
      if (message.text) {
        return message.text
      }

      if (!message.voice?.file_id) {
        throw new NonRetriableError("Message is not a voice message")
      }

      const file = await bot.api.getFile(message.voice.file_id)

      if (!file.file_path) {
        throw new NonRetriableError("Failed to get voice message")
      }

      const fileResponse = await fetch(
        `https://api.telegram.org/file/bot${honoContext.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
      )

      const fileBuffer = await fileResponse.arrayBuffer()

      const formData = new FormData()
      formData.append(
        "file",
        new Blob([fileBuffer], { type: "audio/ogg; codecs=opus" }),
        "voice.ogg",
      )
      formData.append("model", "whisper-1")
      formData.append("response_format", "text")

      const transcriptionResponse = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${honoContext.env.OPENAI_API_KEY}`,
          },
          body: formData,
        },
      )

      return await transcriptionResponse.text()
    })

    await step.run("insert-message", () =>
      database.insert(messagesTable).values({
        id: String(message.message_id),
        userId: String(message.from!.id),
        direction: "incoming",
        type: message.voice?.file_id ? "audio" : "text",
        text,
        fileId: message.voice?.file_id,
      }),
    )

    const result = await network.run(text)

    // console.log(result)
    // console.log(JSON.stringify(result, null, 2))
    // console.log(JSON.stringify(result.state.format(), null, 2))
    // console.log("----------------------- state history:")
    // console.log(JSON.stringify(result.state["_history"], null, 2))

    await step.run("process-result", async () => {
      const lastMessage = result.state.format().at(-1)

      const outgoingMessage = await bot.api.sendMessage(
        message.chat.id,
        lastMessage?.role === "assistant" &&
          lastMessage.type === "text" &&
          !Array.isArray(lastMessage.content)
          ? lastMessage.content
          : "look in the console",
        { parse_mode: "HTML" },
      )

      await database.insert(messagesTable).values({
        id: String(outgoingMessage.message_id),
        userId: String(message.from!.id),
        direction: "outgoing",
        type: "text",
        text: outgoingMessage.text,
      })

      await database.insert(inferenceMessagesTable).values([
        {
          userMessageId: String(message.message_id),
          userId: user.id,
          role: "user",
          content: text,
          order: 0,
        },
        ...result.state.results.flatMap((result, index) => {
          const output = result.output[0]!

          const messages: (typeof inferenceMessagesTable.$inferInsert)[] = [
            {
              userMessageId: String(message.message_id),
              userId: user.id,
              role: "assistant",
              content:
                output.type === "text"
                  ? Array.isArray(output.content)
                    ? output.content.join("\n")
                    : output.content
                  : null,
              toolCallJson:
                output.type === "tool_call"
                  ? JSON.stringify(output.tools[0]!)
                  : null,
              order: index * 2 + 1,
            },
          ]

          if (result.toolCalls.length > 0) {
            messages.push({
              userMessageId: String(message.message_id),
              userId: user.id,
              role: "assistant",
              toolResultJson: JSON.stringify(result.toolCalls[0]),
              order: index * 2 + 2,
            })
          }

          return messages
        }),
      ])
    })
  },
)
