UPDATE "workspaces" SET "plan" = 'admin', "updated_at" = now()
WHERE "id" IN (
  SELECT "workspace_members"."workspace_id"
  FROM "workspace_members"
  JOIN "user" ON "user"."id" = "workspace_members"."user_id"
  WHERE "workspace_members"."role" = 'owner'
    AND lower("user"."email") LIKE '%@nimbus.dev'
);
