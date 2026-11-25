import { Client } from "pg"

import { E2E_USER } from "./user"

export async function seedYouTubeChannel() {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<{ id: string; workspace_id: string }>(
      `select u.id, m.workspace_id from "user" u
       join workspace_members m on m.user_id = u.id
       where u.email = $1`,
      [E2E_USER.email]
    )
    const { id: userId, workspace_id: workspaceId } = rows[0]!
    await client.query(
      `insert into account (id, account_id, provider_id, user_id, access_token, refresh_token, access_token_expires_at)
       values ('e2e-google-account', 'e2e-google', 'google', $1, 'e2e-access-token', 'e2e-refresh-token', now() + interval '1 day')
       on conflict (id) do nothing`,
      [userId]
    )
    await client.query(
      `insert into youtube_channels (id, workspace_id, account_id, channel_id, title, status)
       values ('e2e-channel', $1, 'e2e-google-account', 'UC-fake', 'Fake channel', 'ok')
       on conflict (id) do nothing`,
      [workspaceId]
    )
  } finally {
    await client.end()
  }
}

export async function seedInsightSuggestion() {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL })
  await client.connect()
  try {
    await client.query(
      `insert into insight_suggestions (id, channel_id, target, kind, text, rationale, evidence_for, evidence_against, confidence)
       values ('e2e-suggestion', 'e2e-channel', 'selection', 'add', 'Open on the crash, not the build-up', 'Clips that open on the payoff keep more viewers.', '[]'::jsonb, '[]'::jsonb, 0.8)
       on conflict (id) do nothing`
    )
  } finally {
    await client.end()
  }
}

export async function removeYouTubeChannel() {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL })
  await client.connect()
  try {
    await client.query(
      `delete from insight_suggestions where channel_id = 'e2e-channel'`
    )
    await client.query(
      `delete from playbook_rules where channel_id = 'e2e-channel'`
    )
    await client.query(`delete from youtube_channels where id = 'e2e-channel'`)
    await client.query(`delete from account where id = 'e2e-google-account'`)
  } finally {
    await client.end()
  }
}
