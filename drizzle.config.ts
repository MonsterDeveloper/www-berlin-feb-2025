import { readdirSync } from "node:fs"
import { join } from "node:path"
import { defineConfig } from "drizzle-kit"

function getLocalD1Url() {
  const d1Dir = join(
    ".wrangler",
    "state",
    "v3",
    "d1",
    "miniflare-D1DatabaseObject",
  )
  const files = readdirSync(d1Dir)
  const dbFile = files.find((f) => f.endsWith(".sqlite"))

  if (!dbFile) {
    throw new Error("Could not find local D1 database file")
  }

  return join(d1Dir, dbFile)
}

export default process.env.CLOUDFLARE_ACCOUNT_ID &&
process.env.CLOUDFLARE_DATABASE_ID &&
process.env.CLOUDFLARE_D1_TOKEN
  ? defineConfig({
      out: "drizzle-migrations",
      schema: "./src/db/schema.ts",
      dialect: "sqlite",
      driver: "d1-http",
      dbCredentials: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        databaseId: process.env.CLOUDFLARE_DATABASE_ID,
        token: process.env.CLOUDFLARE_D1_TOKEN,
      },
    })
  : defineConfig({
      out: "drizzle-migrations",
      schema: "./src/db/schema.ts",
      dialect: "sqlite",
      dbCredentials: {
        url: getLocalD1Url(),
      },
    })
