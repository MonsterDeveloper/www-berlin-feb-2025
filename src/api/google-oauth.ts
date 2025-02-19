import { TypedEventTarget } from "typescript-event-target"

interface TokenUpdateEvent {
  accessToken: string
  accessTokenExpiresAt: Date
  refreshToken?: string
}

interface GoogleOAuthEventMap {
  tokenUpdate: CustomEvent<TokenUpdateEvent>
}

export class GoogleOAuthClient extends TypedEventTarget<GoogleOAuthEventMap> {
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private accessToken: string | undefined
  private refreshToken: string | undefined
  private accessTokenExpiresAt: Date | undefined
  private static SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.freebusy",
    "https://www.googleapis.com/auth/calendar.settings.readonly",
    "https://www.googleapis.com/auth/calendar.events.freebusy",
    "https://www.googleapis.com/auth/calendar.app.created",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.calendars.readonly",
    "https://www.googleapis.com/auth/calendar.events.public.readonly",
  ]

  constructor({
    clientId,
    clientSecret,
    redirectUri,
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
  }: {
    clientId: string
    clientSecret: string
    redirectUri: string
    accessToken?: string
    refreshToken?: string
    accessTokenExpiresAt?: Date
  }) {
    super()
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.redirectUri = redirectUri
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this.accessTokenExpiresAt = accessTokenExpiresAt
  }

  generateAuthUrl() {
    const searchParams = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      access_type: "offline",
      scope: GoogleOAuthClient.SCOPES.join(" "),
      include_granted_scopes: "true",
      response_type: "code",
      state: crypto.randomUUID(),
    })

    return {
      state: searchParams.get("state")!,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`,
    }
  }

  async exchangeCode({ code }: { code: string }) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to exchange Google OAuth code: ${await response.text()}`,
      )
    }

    const data: {
      access_token: string
      expires_in: number
      refresh_token: string
    } = await response.json()
    this.accessToken = data.access_token
    this.refreshToken = data.refresh_token
    this.accessTokenExpiresAt = new Date(Date.now() + data.expires_in * 1000)

    this.dispatchTypedEvent(
      "tokenUpdate",
      new CustomEvent("tokenUpdate", {
        detail: {
          accessToken: data.access_token,
          accessTokenExpiresAt: this.accessTokenExpiresAt,
          refreshToken: data.refresh_token,
        },
      }),
    )

    return data
  }

  async refreshAccessToken({ refreshToken }: { refreshToken: string }) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to refresh Google OAuth access token: ${await response.text()}`,
      )
    }

    const data: {
      access_token: string
      expires_in: number
    } = await response.json()
    this.accessToken = data.access_token
    this.accessTokenExpiresAt = new Date(Date.now() + data.expires_in * 1000)

    this.dispatchTypedEvent(
      "tokenUpdate",
      new CustomEvent("tokenUpdate", {
        detail: {
          accessToken: data.access_token,
          accessTokenExpiresAt: this.accessTokenExpiresAt,
        },
      }),
    )

    return data
  }

  async getAccessToken() {
    if (
      this.accessToken &&
      this.accessTokenExpiresAt &&
      this.accessTokenExpiresAt > new Date(Date.now() + 30000) // 30 seconds buffer
    ) {
      return this.accessToken
    }

    if (!this.refreshToken) {
      throw new Error("No refresh token available. User needs to authenticate.")
    }

    // Otherwise, refresh the token
    const { access_token } = await this.refreshAccessToken({
      refreshToken: this.refreshToken,
    })
    return access_token
  }

  setTokens({
    accessToken,
    accessTokenExpiresAt,
    refreshToken,
  }: {
    accessToken?: string
    accessTokenExpiresAt?: Date
    refreshToken?: string
  }) {
    this.accessToken = accessToken
    this.accessTokenExpiresAt = accessTokenExpiresAt
    this.refreshToken = refreshToken
  }
}
