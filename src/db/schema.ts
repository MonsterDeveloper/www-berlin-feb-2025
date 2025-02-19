import { relations, sql } from "drizzle-orm"
import {
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"
import { composeId } from "../compose-id"

export const usersTable = sqliteTable("users", {
  id: text("id").primaryKey(),
  language: text("language", { enum: ["en", "ru"] }),

  googleOAuthState: text("google_oauth_state"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleAccessTokenExpiresAt: integer("google_access_token_expires_at", {
    mode: "timestamp",
  }),

  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
})

export const usersTableRelations = relations(usersTable, ({ many }) => ({
  messages: many(messagesTable),
  ideaFolders: many(ideaFoldersTable),
}))

export const messagesTable = sqliteTable(
  "messages",
  {
    id: text("id").notNull(),
    userId: text("user_id")
      .references(() => usersTable.id)
      .notNull(),

    direction: text("direction", { enum: ["incoming", "outgoing"] }).notNull(),

    type: text("type", {
      enum: ["text", "image", "audio", "document"],
    }).notNull(),

    text: text("text"),

    fileId: text("file_id"),

    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.userId] })], // Message ID is unique for a specific chat
)

export const messagesTableRelations = relations(
  messagesTable,
  ({ one, many }) => ({
    user: one(usersTable, {
      fields: [messagesTable.userId],
      references: [usersTable.id],
    }),
    inferenceMessages: many(inferenceMessagesTable),
  }),
)

export const inferenceMessagesTable = sqliteTable(
  "inference_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => composeId("inferenceMessage")),

    userMessageId: text("user_message_id").notNull(),
    userId: text("user_id").notNull(),

    order: integer("order").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content"),
    toolCallJson: text("tool_call_json"),
    toolResultJson: text("tool_result_json"),

    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.userMessageId],
      foreignColumns: [messagesTable.userId, messagesTable.id],
    }),
  ],
)

export const inferenceMessagesTableRelations = relations(
  inferenceMessagesTable,
  ({ one }) => ({
    userMessage: one(messagesTable, {
      fields: [inferenceMessagesTable.userMessageId],
      references: [messagesTable.id],
    }),
  }),
)

export const ideaFoldersTable = sqliteTable("idea_folders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => composeId("ideaFolder")),
  userId: text("user_id")
    .references(() => usersTable.id)
    .notNull(),

  name: text("name").notNull(),

  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
})

export const ideaFoldersRelations = relations(
  ideaFoldersTable,
  ({ many, one }) => ({
    ideas: many(ideasTable),
    user: one(usersTable, {
      fields: [ideaFoldersTable.userId],
      references: [usersTable.id],
    }),
  }),
)

export const ideasTable = sqliteTable("ideas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => composeId("idea")),
  userId: text("user_id")
    .references(() => usersTable.id)
    .notNull(),

  folderId: text("folder_id").references(() => ideaFoldersTable.id),
  name: text("name").notNull(),
  description: text("description"),

  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
})

export const ideasTableRelations = relations(ideasTable, ({ one }) => ({
  folder: one(ideaFoldersTable, {
    fields: [ideasTable.folderId],
    references: [ideaFoldersTable.id],
  }),
  user: one(usersTable, {
    fields: [ideasTable.userId],
    references: [usersTable.id],
  }),
}))
