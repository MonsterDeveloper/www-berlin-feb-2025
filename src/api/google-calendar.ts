interface CalendarEvent {
  kind: "calendar#event"
  id: string
}

type CalendarEventType =
  | "birthday"
  | "default"
  | "focusTime"
  | "fromGmail"
  | "outOfOffice"
  | "workingLocation"

type EventStatus = "confirmed" | "tentative" | "cancelled"

type AutoDeclineMode =
  | "declineNone"
  | "declineAllConflictingInvitations"
  | "declineOnlyNewConflictingInvitations"

interface FocusTimeProperties {
  autoDeclineMode: AutoDeclineMode
  chatStatus: "available" | "doNotDisturb"
  declineMessage?: string
}

interface OutOfOfficeProperties {
  autoDeclineMode: AutoDeclineMode
  declineMessage?: string
}
interface WorkingLocationProperties {
  type: "homeOffice" | "officeLocation" | "customLocation"
  customLocation?: {
    label?: string
  }
  homeOffice?: unknown
  officeLocation?: {
    buildingId?: string
    deskId?: string
    floorId?: string
    floorSectionId?: string
    label: string
  }
}

interface CalendarEventEndStart {
  /** The date, in the format "yyyy-mm-dd", if this is an all-day event. */
  date?: string

  /**
   * The time, as a combined date-time value (formatted according to RFC3339).
   *
   * A time zone offset is required unless a time zone is explicitly specified in timeZone.
   */
  dateTime?: string

  /**
   * The time zone in which the time is specified.
   *
   * Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich". For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end.
   */
  timeZone?: string
}

type CalendarAccessRole = "freeBusyReader" | "reader" | "writer" | "owner"

interface CalendarListEntry {
  readonly kind: "calendar#calendarListEntry"
  readonly id: string
  readonly accessRole: CalendarAccessRole
  readonly summary: string
  summaryOverride?: string
  readonly description?: string
  readonly timeZone?: string
  readonly deleted?: boolean
  readonly primary?: boolean
}

type UserSetting = { kind: "calendar#setting" } & (
  | {
      id: "autoAddHangouts"
      value: "true" | "false"
    }
  | {
      id: "dateFieldOrder"
      value: "MDY" | "DMY" | "YMD"
    }
  | {
      id: "defaultEventLength"
      value: string
    }
  | {
      id: "format24HourTime"
      value: "true" | "false"
    }
  | {
      id: "hideInvitations"
      value: "true" | "false"
    }
  | {
      id: "hideWeekends"
      value: "true" | "false"
    }
  | {
      id: "locale"
      value:
        | "in"
        | "ca"
        | "cs"
        | "da"
        | "de"
        | "en_GB"
        | "en"
        | "es"
        | "es_419"
        | "tl"
        | "fr"
        | "hr"
        | "it"
        | "lv"
        | "lt"
        | "hu"
        | "nl"
        | "no"
        | "pl"
        | "pt_BR"
        | "pt_PT"
        | "ro"
        | "sk"
        | "sl"
        | "fi"
        | "sv"
        | "tr"
        | "vi"
        | "el"
        | "ru"
        | "sr"
        | "uk"
        | "bg"
        | "iw"
        | "ar"
        | "fa"
        | "hi"
        | "th"
        | "zh_TW"
        | "zh_CN"
        | "ja"
        | "ko"
    }
  | {
      id: "remindOnRespondedEventsOnly"
      value: "true" | "false"
    }
  | {
      id: "showDeclinedEvents"
      value: "true" | "false"
    }
  | {
      id: "timezone"
      value: string // IANA timezone ID
    }
  | {
      id: "useKeyboardShortcuts"
      value: "true" | "false"
    }
  | {
      id: "weekStart"
      value: "0" | "1" | "6"
    }
)

export async function getCalendars(accessToken: string) {
  const resp = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  const data: { items: CalendarListEntry[] } = await resp.json()

  return data.items
}

export async function getUserSettings(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/settings",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  const data: { items: UserSetting[] } = await response.json()

  return data.items
}

export async function getCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin?: string,
  timeMax?: string,
) {
  const searchParams = new URLSearchParams()

  if (timeMin) {
    searchParams.set("timeMin", timeMin)
  }

  if (timeMax) {
    searchParams.set("timeMax", timeMax)
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${searchParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  const data: { items: CalendarEvent[] } = await response.json()

  return data.items
}

export async function getCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  const data: CalendarEvent = await response.json()

  return data
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: {
    start: CalendarEventEndStart
    end: CalendarEventEndStart
    description?: string
    eventType?: CalendarEventType
    focusTimeProperties?: FocusTimeProperties
    location?: string
    outOfOfficeProperties?: OutOfOfficeProperties
    recurrence?: string[]
    status?: EventStatus
    summary?: string
    workingLocationProperties?: WorkingLocationProperties
  },
) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    },
  )

  const data: CalendarEvent = await response.json()

  return data
}
