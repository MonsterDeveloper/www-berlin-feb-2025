import type { Message } from "grammy/types"
import type { Context } from "hono"
import { EventSchemas, Inngest, InngestMiddleware } from "inngest"
import type { HonoContext } from "."

const bindings = new InngestMiddleware({
  name: "Cloudflare Workers bindings",
  init() {
    return {
      onFunctionRun({ reqArgs }) {
        return {
          transformInput() {
            // reqArgs is the array of arguments passed to the Worker's fetch event handler
            // ex. fetch(request, env, ctx)
            // We cast the argument to the global Env var that Wrangler generates:
            const honoContext = reqArgs[0] as Context<HonoContext>
            return {
              ctx: {
                // Return the env object to the function handler's input args
                honoContext,
              },
            }
          },
        }
      },
    }
  },
})

type Events = {
  "message.received": {
    data: {
      message: Message
    }
  }
}

export const inngest = new Inngest({
  id: "www-berlin-feb-2025",
  middleware: [bindings],
  schemas: new EventSchemas().fromRecord<Events>(),
})
