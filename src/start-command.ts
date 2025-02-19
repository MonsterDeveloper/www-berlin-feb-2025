import { eq } from "drizzle-orm"
import { InlineKeyboard } from "grammy"
import type { HonoContext } from "."
import { usersTable } from "./db/schema"

export function attachStartCommandHandler({
  bot,
  database,
  googleOAuthClient,
}: {
  bot: HonoContext["Variables"]["bot"]
  database: HonoContext["Variables"]["database"]
  googleOAuthClient: HonoContext["Variables"]["googleOAuthClient"]
}) {
  bot.command("start", async (context) => {
    const user = await database.query.usersTable.findFirst({
      where: eq(usersTable.id, String(context.chat.id)),
    })

    if (user?.googleAccessToken) {
      return context.reply("You are already registered")
    }

    const { url, state } = googleOAuthClient.generateAuthUrl()

    if (!user) {
      await database
        .insert(usersTable)
        .values({ id: String(context.chat.id), googleOAuthState: state })
    } else {
      await database
        .update(usersTable)
        .set({
          googleOAuthState: state,
        })
        .where(eq(usersTable.id, String(context.chat.id)))
    }

    await context.reply(
      "Hi! I'm Aurora, your personal AI assistant. I can manage your events and quickly store your ideas right in the Telegram chat. Connect Google Calendar using the button below",
      {
        reply_markup: new InlineKeyboard().url("Connect Google Calendar", url),
      },
    )
  })
}
