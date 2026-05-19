import {
  pgTable,
  serial,
  bigint,
  text,
  boolean,
  doublePrecision,
  integer,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  stravaAthleteId: bigint('strava_athlete_id', { mode: 'number' }).notNull().unique(),
  firstname: text('firstname').notNull(),
  lastname: text('lastname').notNull(),
  avatarUrl: text('avatar_url'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  hasPremium: boolean('has_premium').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
});

export const segments = pgTable('segments', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  polyline: text('polyline').notNull(),
  startLat: doublePrecision('start_lat').notNull(),
  startLng: doublePrecision('start_lng').notNull(),
  endLat: doublePrecision('end_lat').notNull(),
  endLng: doublePrecision('end_lng').notNull(),
  distanceM: doublePrecision('distance_m').notNull(),
  avgGrade: doublePrecision('avg_grade'),
  elevationProfileUrl: text('elevation_profile_url'),
  localLegendEnabled: boolean('local_legend_enabled').notNull().default(false),
  leaderEffortCountOverall: integer('leader_effort_count_overall'),
  leaderEffortCountFemale: integer('leader_effort_count_female'),
  localLegendAthleteId: bigint('local_legend_athlete_id', { mode: 'number' }),
  detailsFetchedAt: timestamp('details_fetched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const favorites = pgTable(
  'favorites',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    segmentId: bigint('segment_id', { mode: 'number' })
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.segmentId] })]
);

export const athleteEfforts = pgTable(
  'athlete_efforts',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    segmentId: bigint('segment_id', { mode: 'number' })
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    recent90dCount: integer('recent_90d_count').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.segmentId] })]
);

export const rateLimitState = pgTable('rate_limit_state', {
  id: integer('id').primaryKey().default(1),
  shortWindowUsage: integer('short_window_usage').notNull().default(0),
  shortWindowResetAt: timestamp('short_window_reset_at', { withTimezone: true }).notNull().defaultNow(),
  longWindowUsage: integer('long_window_usage').notNull().default(0),
  longWindowResetAt: timestamp('long_window_reset_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;
export type Favorite = typeof favorites.$inferSelect;
export type AthleteEffort = typeof athleteEfforts.$inferSelect;
