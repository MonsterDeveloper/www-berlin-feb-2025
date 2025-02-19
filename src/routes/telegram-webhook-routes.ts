import { webhookCallback } from "grammy"
import { Hono } from "hono"
import type { HonoContext } from ".."

export const telegramWebhookRoutes = new Hono<HonoContext>().post(
  "/",
  (context) => {
    return webhookCallback(context.get("bot"), "hono")(context)
  },
)
