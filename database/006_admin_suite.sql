CREATE OR REPLACE FUNCTION rockmerch_save_staff_user(
    p_user_id BIGINT,
    p_email TEXT,
    p_role TEXT,
    p_password_hash TEXT
)
RETURNS TABLE(id BIGINT, email TEXT, role TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_user users%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(739121, 1);
    IF p_email IS NULL
      OR length(p_email) > 254
      OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      OR p_role NOT IN ('admin', 'editor') THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Staff data is invalid.';
    END IF;

    IF p_user_id IS NULL THEN
        IF p_password_hash IS NULL OR p_password_hash = '' THEN
            RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'A password is required for new staff.';
        END IF;
        RETURN QUERY
        INSERT INTO users(email, password, role)
        VALUES (lower(p_email), p_password_hash, p_role)
        RETURNING users.id, users.email, users.role;
        RETURN;
    END IF;

    SELECT * INTO v_user FROM users WHERE users.id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'R0002', MESSAGE = 'Staff user not found.';
    END IF;
    IF v_user.role = 'admin' AND p_role <> 'admin'
      AND (SELECT COUNT(*) FROM users WHERE users.role = 'admin') <= 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'R0003', MESSAGE = 'The last admin cannot be demoted.';
    END IF;

    IF p_password_hash IS NULL OR p_password_hash = '' THEN
        RETURN QUERY
        UPDATE users
        SET email = lower(p_email), role = p_role
        WHERE users.id = p_user_id
        RETURNING users.id, users.email, users.role;
    ELSE
        RETURN QUERY
        UPDATE users
        SET email = lower(p_email), role = p_role, password = p_password_hash
        WHERE users.id = p_user_id
        RETURNING users.id, users.email, users.role;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION rockmerch_delete_staff_user(
    p_user_id BIGINT,
    p_actor_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_role TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock(739121, 1);
    IF p_user_id = p_actor_id THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'The active staff user cannot be deleted.';
    END IF;

    SELECT role INTO v_role FROM users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'R0002', MESSAGE = 'Staff user not found.';
    END IF;
    IF v_role = 'admin' AND (SELECT COUNT(*) FROM users WHERE role = 'admin') <= 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'R0003', MESSAGE = 'The last admin cannot be deleted.';
    END IF;

    DELETE FROM users WHERE id = p_user_id;
    RETURN TRUE;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_admin_activity_recent
    ON admin_activity(created_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('006_admin_suite')
ON CONFLICT (version) DO NOTHING;
