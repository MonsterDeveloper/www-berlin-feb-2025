// import { instrument } from "@fiberplane/hono-otel";
import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono"
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1"
import { Bot } from "grammy"
import { Hono } from "hono"
import { serve } from "inngest/hono"
import { GoogleOAuthClient } from "./api/google-oauth"
import { attachBotMessageHandler } from "./bot-message"
import * as schema from "./db/schema"
import { handleMessage } from "./handle-message"
import { inngest } from "./inngest"
import { googleOAuthRoutes } from "./routes/google-oauth-routes"
import { telegramWebhookRoutes } from "./routes/telegram-webhook-routes"
import { attachStartCommandHandler } from "./start-command"

type Bindings = {
  DB: D1Database
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_BOT_INFO: string
  GOOGLE_OAUTH_CLIENT_ID: string
  GOOGLE_OAUTH_CLIENT_SECRET: string
  GOOGLE_OAUTH_REDIRECT_URI: string
  OPENAI_API_KEY: string
}
type Variables = {
  database: DrizzleD1Database<typeof schema>
  bot: Bot
  googleOAuthClient: GoogleOAuthClient
}

export type HonoContext = {
  Bindings: Bindings
  Variables: Variables
}

const app = new Hono<HonoContext>()

// Context middleware
app.use(async (context, next) => {
  const database = drizzle(context.env.DB, { schema })
  context.set("database", database)

  const bot = new Bot(context.env.TELEGRAM_BOT_TOKEN, {
    botInfo: JSON.parse(context.env.TELEGRAM_BOT_INFO),
  })
  context.set("bot", bot)

  const googleOAuthClient = new GoogleOAuthClient({
    clientId: context.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: context.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: context.env.GOOGLE_OAUTH_REDIRECT_URI,
  })
  context.set("googleOAuthClient", googleOAuthClient)

  attachStartCommandHandler({ bot, database, googleOAuthClient })
  attachBotMessageHandler({ bot, database })

  await next()
})

app.route("/telegram_webhook", telegramWebhookRoutes)

app.route("/googleoauth2", googleOAuthRoutes)
app.on(
  ["GET", "PUT", "POST"],
  "/api/inngest",
  serve({
    client: inngest,
    functions: [handleMessage],
  }),
)

/**
 * Serve a simplified api specification for your API
 * As of writing, this is just the list of routes and their methods.
 */
app.get("/openapi.json", (c) => {
  return c.json(
    // @ts-expect-error - @fiberplane/hono is in beta and still not typed correctly
    createOpenAPISpec(app, {
      openapi: "3.0.0",
      info: {
        title: "Honc D1 App",
        version: "1.0.0",
      },
    }),
  )
})

/**
 * Mount the Fiberplane api explorer to be able to make requests against your API.
 *
 * Visit the explorer at `/fp`
 */
app.use(
  "/fp/*",
  createFiberplane({
    openapi: { url: "/openapi.json" },
  }),
)

export default app

// Export the instrumented app if you've wired up a Fiberplane-Hono-OpenTelemetry trace collector
//
// export default instrument(app);
