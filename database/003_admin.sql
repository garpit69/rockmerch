CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiration
    ON admin_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_recent
    ON login_attempts(identity_hash, attempted_at DESC);

CREATE OR REPLACE FUNCTION rockmerch_admin_update_order(
    p_order_id BIGINT,
    p_status TEXT,
    p_shipping_carrier TEXT,
    p_tracking_number TEXT,
    p_tracking_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_item RECORD;
    v_product products%ROWTYPE;
    v_formats JSONB;
    v_found BOOLEAN;
    v_entry JSONB;
    v_result JSONB;
BEGIN
    IF p_status NOT IN (
        'awaiting_payment', 'awaiting_confirmation', 'confirmed',
        'packing', 'shipped', 'completed', 'cancelled'
    ) OR length(COALESCE(p_shipping_carrier, '')) > 80
      OR length(COALESCE(p_tracking_number, '')) > 120
      OR length(COALESCE(p_tracking_url, '')) > 1000
      OR (p_tracking_url <> '' AND p_tracking_url !~ '^https://[^[:space:]]+$') THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Order update is invalid.';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'R0002', MESSAGE = 'Order not found.';
    END IF;
    IF v_order.status = 'cancelled' AND p_status <> 'cancelled' THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Cancelled orders cannot be reopened.';
    END IF;

    IF p_status = 'cancelled' AND v_order.status <> 'cancelled' THEN
        FOR v_item IN
            SELECT product_id, format, quantity
            FROM order_items
            WHERE order_id = p_order_id AND product_id IS NOT NULL
            ORDER BY product_id
        LOOP
            SELECT * INTO v_product FROM products WHERE id = v_item.product_id FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION USING ERRCODE = 'R0003', MESSAGE = 'Order product no longer exists.';
            END IF;

            v_found := FALSE;
            SELECT jsonb_agg(
                CASE
                    WHEN COALESCE(entry.value->>'format', entry.value->>'name') = v_item.format THEN
                        jsonb_set(
                            entry.value,
                            '{stock}',
                            to_jsonb(COALESCE((entry.value->>'stock')::INTEGER, 0) + v_item.quantity),
                            TRUE
                        )
                    ELSE entry.value
                END
                ORDER BY entry.ordinality
            ), bool_or(COALESCE(entry.value->>'format', entry.value->>'name') = v_item.format)
            INTO v_formats, v_found
            FROM jsonb_array_elements(v_product.formats)
                WITH ORDINALITY AS entry(value, ordinality);

            IF NOT COALESCE(v_found, FALSE) THEN
                RAISE EXCEPTION USING ERRCODE = 'R0003', MESSAGE = 'Order product format no longer exists.';
            END IF;

            UPDATE products SET formats = v_formats WHERE id = v_item.product_id;
        END LOOP;
    END IF;

    UPDATE orders
    SET status = p_status,
        shipping_carrier = COALESCE(p_shipping_carrier, ''),
        tracking_number = COALESCE(p_tracking_number, ''),
        tracking_url = COALESCE(p_tracking_url, ''),
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING jsonb_build_object(
        'id', id,
        'order_number', order_number,
        'status', status,
        'shipping_carrier', shipping_carrier,
        'tracking_number', tracking_number,
        'tracking_url', tracking_url
    ) INTO v_result;

    RETURN v_result;
END;
$$;

INSERT INTO schema_migrations(version)
VALUES ('003_admin')
ON CONFLICT (version) DO NOTHING;
