ALTER TABLE password_resets
    ADD COLUMN IF NOT EXISTS requested_at BIGINT
    NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT;

CREATE INDEX IF NOT EXISTS idx_password_resets_user_requested
    ON password_resets(user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_resets_token_expiry
    ON password_resets(token_hash, expires_at)
    WHERE used_at IS NULL;

CREATE OR REPLACE FUNCTION rockmerch_queue_password_reset(
    p_email TEXT,
    p_token_hash TEXT,
    p_reset_link TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_user users%ROWTYPE;
    v_requested_at BIGINT := FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT;
    v_reset_id BIGINT;
    v_recent_requests INTEGER;
BEGIN
    SELECT * INTO v_user
    FROM users
    WHERE lower(email) = lower(p_email)
      AND role IN ('admin', 'editor')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_recent_requests
    FROM password_resets
    WHERE user_id = v_user.id
      AND requested_at > v_requested_at - 3600;

    IF v_recent_requests >= 3 THEN
        RETURN FALSE;
    END IF;

    INSERT INTO password_resets(user_id, token_hash, expires_at, requested_at)
    VALUES (v_user.id, p_token_hash, v_requested_at + 1800, v_requested_at)
    RETURNING id INTO v_reset_id;

    INSERT INTO email_outbox(event_key, recipient, subject, body, available_at)
    VALUES (
        'password-reset:' || v_reset_id,
        v_user.email,
        'Atur ulang kata sandi - RockMerch',
        'Gunakan tautan berikut dalam 30 menit untuk mengatur ulang kata sandi akun RockMerch:'
            || CHR(10) || CHR(10) || p_reset_link
            || CHR(10) || CHR(10)
            || 'Jika Anda tidak meminta perubahan ini, abaikan email ini.',
        v_requested_at
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION rockmerch_consume_password_reset(
    p_token_hash TEXT,
    p_password_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id BIGINT;
    v_now BIGINT := FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT;
BEGIN
    SELECT reset.user_id INTO v_user_id
    FROM password_resets AS reset
    JOIN users AS account ON account.id = reset.user_id
    WHERE reset.token_hash = p_token_hash
      AND reset.expires_at > v_now
      AND reset.used_at IS NULL
      AND account.role IN ('admin', 'editor')
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    PERFORM 1 FROM users WHERE id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    PERFORM 1
    FROM password_resets
    WHERE token_hash = p_token_hash
      AND user_id = v_user_id
      AND expires_at > v_now
      AND used_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    UPDATE users
    SET password = p_password_hash
    WHERE id = v_user_id
      AND role IN ('admin', 'editor');

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    UPDATE password_resets
    SET used_at = v_now
    WHERE user_id = v_user_id
      AND used_at IS NULL;

    DELETE FROM admin_sessions WHERE user_id = v_user_id;
    RETURN TRUE;
END;
$$;

INSERT INTO schema_migrations(version)
VALUES ('007_resend_email')
ON CONFLICT (version) DO NOTHING;
