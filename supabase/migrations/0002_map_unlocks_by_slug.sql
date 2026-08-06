-- Places (like trails/waypoints) live as JSON under /content, not in Postgres --
-- same reasoning as the original schema note in 0001_init.sql: the family's
-- content evolves without a DB migration, and dynamic state references it by
-- a stable string id. map_unlocks was originally designed around a `map_places`
-- Postgres table that was never populated; switch it to a free-text slug to
-- match the pattern used everywhere else.

alter table map_unlocks drop column place_id;
alter table map_unlocks add column place_slug text not null;
