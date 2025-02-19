import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { usersTable } from "../db/schema"
import type { HonoContext } from "../index"

export const googleOAuthRoutes = new Hono<HonoContext>().get(
  "/",
  async (context) => {
    const { error, code, state } = context.req.query()

    if (error) {
      return context.text(`Google oauth error: ${error}`, 400)
    }

    if (!code) {
      return context.text("Google oauth error: no code", 400)
    }

    if (!state) {
      return context.text("Google oauth error: no state", 400)
    }

    const database = context.get("database")

    const user = await database.query.usersTable.findFirst({
      where: eq(usersTable.googleOAuthState, state!),
    })

    if (!user) {
      return context.text("Google oauth error: user not found", 400)
    }

    const googleOAuthClient = context.get("googleOAuthClient")

    const { access_token, expires_in, refresh_token } =
      await googleOAuthClient.exchangeCode({
        code,
      })

    await database
      .update(usersTable)
      .set({
        googleAccessToken: access_token,
        googleRefreshToken: refresh_token,
        googleAccessTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        googleOAuthState: null,
      })
      .where(eq(usersTable.id, user.id))

    await context
      .get("bot")
      .api.sendMessage(
        user.id,
        "Google Calendar connected successfully! Start chatting =D",
      )

    return context.redirect(
      `https://t.me/${context.get("bot").botInfo.username}`,
    )
  },
)
