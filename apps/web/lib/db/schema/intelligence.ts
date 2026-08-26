import { pgTable, varchar, text, timestamp, integer, jsonb, index, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { generateId } from "ai";

export const chats = pgTable("chats", {
  id: varchar("id").primaryKey().$defaultFn(() => generateId()),
  userId: uuid("user_id").references(() => users.id).notNull(),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("chats_user_id_idx").on(table.userId),
]);

export const intelligenceMessages = pgTable("intelligence_messages", {
  id: varchar("id").primaryKey().$defaultFn(() => generateId()),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role").$type<"user" | "assistant">().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("intelligence_messages_chat_id_idx").on(table.chatId),
  index("intelligence_messages_chat_id_created_at_idx").on(table.chatId, table.createdAt),
]);

export const messageParts = pgTable("message_parts", {
  id: varchar("id").primaryKey().$defaultFn(() => generateId()),
  messageId: varchar("message_id").references(() => intelligenceMessages.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type").notNull(),
  order: integer("order").notNull().default(0),
  textContent: text("text_content"),
  toolCallId: varchar("tool_call_id"),
  toolName: varchar("tool_name"),
  toolArgs: jsonb("tool_args"),
  toolState: varchar("tool_state").$type<"input-available" | "output-available" | "output-error">(),
  toolResult: jsonb("tool_result"),
  toolErrorText: text("tool_error_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("message_parts_message_id_idx").on(table.messageId),
]);

export const chatsRelations = relations(chats, ({ many }) => ({
  messages: many(intelligenceMessages),
}));

export const intelligenceMessagesRelations = relations(intelligenceMessages, ({ one, many }) => ({
  chat: one(chats, { fields: [intelligenceMessages.chatId], references: [chats.id] }),
  parts: many(messageParts),
}));

export const messagePartsRelations = relations(messageParts, ({ one }) => ({
  message: one(intelligenceMessages, { fields: [messageParts.messageId], references: [intelligenceMessages.id] }),
}));
