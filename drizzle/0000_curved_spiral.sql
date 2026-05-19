CREATE TABLE "athlete_efforts" (
	"user_id" integer NOT NULL,
	"segment_id" bigint NOT NULL,
	"recent_90d_count" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_efforts_user_id_segment_id_pk" PRIMARY KEY("user_id","segment_id")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" integer NOT NULL,
	"segment_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_segment_id_pk" PRIMARY KEY("user_id","segment_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"short_window_usage" integer DEFAULT 0 NOT NULL,
	"short_window_reset_at" timestamp with time zone DEFAULT now() NOT NULL,
	"long_window_usage" integer DEFAULT 0 NOT NULL,
	"long_window_reset_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"polyline" text NOT NULL,
	"start_lat" double precision NOT NULL,
	"start_lng" double precision NOT NULL,
	"end_lat" double precision NOT NULL,
	"end_lng" double precision NOT NULL,
	"distance_m" double precision NOT NULL,
	"avg_grade" double precision,
	"elevation_profile_url" text,
	"local_legend_enabled" boolean DEFAULT false NOT NULL,
	"leader_effort_count_overall" integer,
	"leader_effort_count_female" integer,
	"details_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"strava_athlete_id" bigint NOT NULL,
	"firstname" text NOT NULL,
	"lastname" text NOT NULL,
	"avatar_url" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"has_premium" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_strava_athlete_id_unique" UNIQUE("strava_athlete_id")
);
--> statement-breakpoint
ALTER TABLE "athlete_efforts" ADD CONSTRAINT "athlete_efforts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_efforts" ADD CONSTRAINT "athlete_efforts_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;