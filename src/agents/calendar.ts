import { createAgent, createTool, openai } from "@inngest/agent-kit"
import type { Context } from "hono"
import { z } from "zod"
import type { HonoContext } from ".."
import {
  createCalendarEvent,
  getCalendarEvents,
  getCalendars,
} from "../api/google-calendar"
import type { usersTable } from "../db/schema"

export function createCalendarAgent({
  honoContext,
  // user,
}: {
  honoContext: Context<HonoContext>
  user: typeof usersTable.$inferSelect
}) {
  const googleOAuthClient = honoContext.get("googleOAuthClient")
  // const database = honoContext.get("database")

  const getCalendarsTool = createTool({
    name: "get_calendars",
    description: "Returns all of the user's calendars",
    handler: async () => {
      const accessToken = await googleOAuthClient.getAccessToken()

      const calendars = await getCalendars(accessToken)

      return calendars
    },
  })

  const getEventsTool = createTool({
    name: "get_events",
    description: "Returns all of the events for a given calendar",
    parameters: z
      .object({
        timeMax: z
          .string()
          .nullable()
          .describe(
            "Upper bound (exclusive) for an event's start time to filter by. Optional. The default is not to filter by start time. Must be an RFC3339 timestamp with mandatory time zone offset, for example, 2011-06-03T10:00:00-07:00, 2011-06-03T10:00:00Z. Milliseconds may be provided but are ignored. If timeMin is set, timeMax must be greater than timeMin.",
          ),
        timeMin: z
          .string()
          .nullable()
          .describe(
            "Lower bound (exclusive) for an event's end time to filter by. Optional. The default is not to filter by end time. Must be an RFC3339 timestamp with mandatory time zone offset, for example, 2011-06-03T10:00:00-07:00, 2011-06-03T10:00:00Z. Milliseconds may be provided but are ignored. If timeMax is set, timeMin must be smaller than timeMax.",
          ),
        calendarId: z
          .string()
          .describe("The ID of the calendar to get events from"),
      })
      .strict(),
    handler: async ({ timeMax, timeMin, calendarId }) => {
      const accessToken = await googleOAuthClient.getAccessToken()

      const events = await getCalendarEvents(
        accessToken,
        calendarId,
        timeMin ?? undefined,
        timeMax ?? undefined,
      )

      return events
    },
  })

  const createEventTool = createTool({
    name: "create_event",
    description: "Creates a new event in the user's Google Calendar",
    parameters: z
      .object({
        calendarId: z
          .string()
          .describe("The ID of the calendar to create the event in"),
        event: z.object({
          start: z
            .string()
            .describe(
              "The start time of the event. A combined date-time value (formatted according to RFC3339).",
            ),
          end: z
            .string()
            .describe(
              "The end time of the event. A combined date-time value (formatted according to RFC3339).",
            ),
          description: z.string().describe("The description of the event."),
        }),
      })
      .strict(),
    handler: async ({ calendarId, event }) => {
      const accessToken = await googleOAuthClient.getAccessToken()

      const createdEvent = await createCalendarEvent(accessToken, calendarId, {
        start: {
          dateTime: event.start,
        },
        end: {
          dateTime: event.end,
        },
        description: event.description,
      })

      return createdEvent
    },
  })

  return createAgent({
    name: "Google Calendar agent",
    description: "Manages Google Calendar events",
    system: `You are a helpful assistant that can manage Google Calendar events. Current date and time is: ${new Date().toISOString()} (${new Date().toLocaleString("en-US", { weekday: "long" })}). Timezone: UTC+1 Europe/Berlin. Week starts on Monday.`,
    tools: [getCalendarsTool, getEventsTool],
    model: openai({
      model: "gpt-4o-mini",
      apiKey: honoContext.env.OPENAI_API_KEY,
    }),
    lifecycle: {
      onFinish: ({ result }) => {
        result.withFormatter((result) => {
          return result.output.concat(result.toolCalls)
        })
        return result
      },
    },
  })
}
