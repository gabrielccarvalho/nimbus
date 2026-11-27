UPDATE "workspaces" SET "plan" = 'free', "updated_at" = now()
WHERE "plan" = 'admin'
  AND "id" NOT IN (
    SELECT "workspace_members"."workspace_id"
    FROM "workspace_members"
    JOIN "user" ON "user"."id" = "workspace_members"."user_id"
    WHERE "workspace_members"."role" = 'owner'
      AND lower("user"."email") = 'gabe@nimbus.dev'
  );
