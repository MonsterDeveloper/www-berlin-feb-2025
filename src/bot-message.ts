import { eq } from "drizzle-orm"
import type { HonoContext } from "."
import { usersTable } from "./db/schema"
import { inngest } from "./inngest"

export function attachBotMessageHandler({
  bot,
  database,
}: {
  bot: HonoContext["Variables"]["bot"]
  database: HonoContext["Variables"]["database"]
}) {
  bot.on(["msg:text", "msg:voice"], async (context) => {
    const user = await database.query.usersTable.findFirst({
      where: eq(usersTable.id, String(context.chat.id)),
    })

    if (!user?.googleAccessToken) {
      return context.reply(
        "Please connect your Google Calendar first using /start command.",
      )
    }

    await inngest.send({
      name: "message.received",
      data: {
        message: context.message!,
      },
    })
  })
}
