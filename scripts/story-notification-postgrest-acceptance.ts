import assert from "node:assert/strict";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  createStoryNotificationDeliveryState,
  createStoryNotificationPublisher,
  StoryNotificationRepositoryError,
} from "../backend/src/domains/storylines/server/notificationCapabilities.ts";
import { StoryNotificationRepositoryError as CanonicalError } from "../backend/src/domains/storylines/contracts/storyNotificationContracts.ts";

assert.equal(Deno.env.get("REF018_DISPOSABLE_DATABASE"), "1");
const database = Deno.env.get("DATABASE_URL") || "";
const db = new URL(database);
assert.ok(
  ["postgres:", "postgresql:"].includes(db.protocol) &&
    db.hostname === "127.0.0.1" && db.port === "54322" &&
    db.pathname === "/postgres" && db.username === "postgres" && !db.search &&
    !db.hash,
);
const api = new URL(Deno.env.get("SUPABASE_URL") || "");
assert.ok(
  api.origin === "http://127.0.0.1:54321" && api.pathname === "/" &&
    !api.username && !api.password && !api.search && !api.hash,
);
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
assert.ok(key);
const sha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sha, /^[a-f0-9]{40}$/);
const head = await new Deno.Command("git", {
  args: ["rev-parse", "HEAD"],
  stdout: "piped",
  stderr: "null",
}).output();
assert.ok(
  head.success && new TextDecoder().decode(head.stdout).trim() === sha,
  "Source SHA mismatch",
);
const staff = crypto.randomUUID(),
  auth = crypto.randomUUID(),
  game = crypto.randomUUID(),
  otherGame = crypto.randomUUID(),
  player = crypto.randomUUID(),
  otherPlayer = crypto.randomUUID(),
  source = crypto.randomUUID();
const q = (s: string) => `'${s}'`;
async function sql(statement: string): Promise<string> {
  const result = await new Deno.Command("psql", {
    args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
    clearEnv: true,
    env: {
      PATH: "/usr/bin:/bin",
      PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000",
    },
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!result.success) throw new Error("Disposable fixture SQL failed");
  return new TextDecoder().decode(result.stdout).trim();
}
const client = createClient(api.origin, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let failure: unknown;
try {
  await sql(`begin;
    insert into public.staff_users(id,supabase_auth_user_id,email,display_name) values(${
    q(staff)
  },${q(auth)},${q(staff + "@example.test")},'story acceptance');
    insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status) values(${
    q(game)
  },${q(staff)},'story acceptance A','active','active','pending'),(${
    q(otherGame)
  },${q(staff)},'story acceptance B','active','active','pending');
    insert into public.players(id,game_session_id,display_name) values(${
    q(player)
  },${q(game)},'story acceptance A'),(${q(otherPlayer)},${
    q(otherGame)
  },'story acceptance B'); commit;`);
  const publisher = createStoryNotificationPublisher(client as never);
  const state = createStoryNotificationDeliveryState(client as never);
  const input = {
    gameSessionId: game,
    sourceType: "story_event",
    sourceId: source,
    notificationType: "story_cutscene" as const,
    title: "fixture",
    summary: "fixture",
    priority: "major" as const,
    displayMode: "notification_only" as const,
    payload: {},
    publishedAt: "2026-07-21T04:00:00.000Z",
  };
  const created = await publisher.createStoryNotification(input);
  assert.equal(created.status, "inserted");
  const replay = await publisher.createStoryNotification(input);
  assert.equal(replay.status, "existing");
  assert.equal(replay.notification.id, created.notification.id);
  const deliveryInput = {
    notificationId: created.notification.id,
    gameSessionId: game,
    playerIds: [player],
    deliveredAt: input.publishedAt,
  };
  const delivery = await publisher.createNotificationDeliveries(deliveryInput);
  assert.equal(delivery.insertedCount, 1);
  assert.equal(delivery.existingCount, 0);
  const repeated = await publisher.createNotificationDeliveries(deliveryInput);
  assert.equal(repeated.insertedCount, 0);
  assert.equal(repeated.existingCount, 1);
  assert.deepEqual(repeated.deliveryIds, delivery.deliveryIds);
  const mark = {
    deliveryId: delivery.deliveryIds[0],
    gameSessionId: game,
    playerId: player,
    markedAt: "2026-07-21T04:01:00.000Z",
  };
  assert.equal(StoryNotificationRepositoryError, CanonicalError);
  for (
    const wrong of [{ ...mark, gameSessionId: otherGame }, {
      ...mark,
      playerId: otherPlayer,
    }]
  ) {
    await assert.rejects(
      () => state.markNotificationDeliverySeen(wrong),
      (error: unknown) =>
        error instanceof CanonicalError &&
        error.code === "story_notification_delivery_not_found",
    );
  }
  assert.equal(
    await sql(
      `select count(*) from public.notification_deliveries where id=${
        q(mark.deliveryId)
      } and game_session_id=${q(game)} and player_id=${
        q(player)
      } and seen_at is null and dismissed_at is null and acknowledged_at is null`,
    ),
    "1",
    "Wrong-scope attempts must not change delivery state",
  );
  const seen = await state.markNotificationDeliverySeen(mark);
  const dismissed = await state.markNotificationDeliveryDismissed(mark);
  const acknowledged = await state.markNotificationDeliveryAcknowledged(mark);
  for (
    const value of [
      seen.seenAt,
      dismissed.dismissedAt,
      acknowledged.acknowledgedAt,
    ]
  ) {
    assert.equal(Date.parse(value!), Date.parse(mark.markedAt));
  }
  assert.equal(
    await sql(
      `select count(*) from public.notifications n join public.notification_deliveries d on d.notification_id=n.id where n.id=${
        q(created.notification.id)
      } and n.game_session_id=${q(game)} and n.source_id=${
        q(source)
      } and d.id=${q(mark.deliveryId)} and d.game_session_id=${
        q(game)
      } and d.player_id=${q(player)} and d.seen_at=${
        q(mark.markedAt)
      }::timestamptz and d.dismissed_at=${
        q(mark.markedAt)
      }::timestamptz and d.acknowledged_at=${q(mark.markedAt)}::timestamptz`,
    ),
    "1",
  );
} catch (error) {
  failure = error;
} finally {
  // Armed before the seed: even a lost psql result after COMMIT must be cleaned.
  try {
    const ownedStaff = `id=${q(staff)} and supabase_auth_user_id=${
      q(auth)
    } and email=${
      q(staff + "@example.test")
    } and display_name='story acceptance'`;
    const ownedGames = `owner_staff_user_id=${q(staff)} and ((id=${
      q(game)
    } and name='story acceptance A') or (id=${
      q(otherGame)
    } and name='story acceptance B')) and exists(select 1 from public.staff_users where ${ownedStaff})`;
    const ownedPlayers = `((id=${q(player)} and game_session_id=${
      q(game)
    } and display_name='story acceptance A') or (id=${
      q(otherPlayer)
    } and game_session_id=${
      q(otherGame)
    } and display_name='story acceptance B')) and game_session_id in (select id from public.game_sessions where ${ownedGames})`;
    const ownedNotifications = `game_session_id=${
      q(game)
    } and source_type='story_event' and source_id=${
      q(source)
    } and game_session_id in (select id from public.game_sessions where ${ownedGames})`;
    const ownedParties =
      `party_kind='player' and player_id in (select id from public.players where ${ownedPlayers}) and game_session_id in (select id from public.game_sessions where ${ownedGames})`;
    await sql(`begin;
    delete from public.notification_deliveries where game_session_id=${
      q(game)
    } and player_id=${
      q(player)
    } and player_id in (select id from public.players where ${ownedPlayers}) and notification_id in (select id from public.notifications where ${ownedNotifications});
    delete from public.notifications where ${ownedNotifications};
    delete from public.inventory_accounts where game_session_id in (select id from public.game_sessions where ${ownedGames}) and party_id in (select id from public.economic_parties where ${ownedParties});
    delete from public.economic_parties where ${ownedParties};
    delete from public.players where ${ownedPlayers};
    delete from public.game_sessions where ${ownedGames};
    delete from public.staff_users where ${ownedStaff}; commit;`);
    assert.equal(
      await sql(`select
    (select count(*) from public.notification_deliveries where game_session_id in (${
        q(game)
      },${q(otherGame)}) or player_id in (${q(player)},${q(otherPlayer)})) +
    (select count(*) from public.notifications where game_session_id in (${
        q(game)
      },${q(otherGame)}) or source_id=${q(source)}) +
    (select count(*) from public.inventory_accounts where game_session_id in (${
        q(game)
      },${q(otherGame)})) +
    (select count(*) from public.economic_parties where game_session_id in (${
        q(game)
      },${q(otherGame)}) or player_id in (${q(player)},${q(otherPlayer)})) +
    (select count(*) from public.players where id in (${q(player)},${
        q(otherPlayer)
      })) +
    (select count(*) from public.game_sessions where id in (${q(game)},${
        q(otherGame)
      })) +
    (select count(*) from public.staff_users where id=${q(staff)})`),
      "0",
      "Fixture cleanup incomplete",
    );
  } catch (cleanupError) {
    if (failure !== undefined) {
      throw new AggregateError(
        [failure, cleanupError],
        "Acceptance and cleanup failed",
      );
    }
    throw cleanupError;
  }
}
if (failure !== undefined) throw failure;
console.log("Story notification acceptance passed; fixture cleanup verified");
