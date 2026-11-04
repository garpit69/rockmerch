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

    IF p_status <> v_order.status AND NOT (
        (v_order.status = 'awaiting_payment' AND p_status IN ('awaiting_confirmation', 'confirmed', 'cancelled'))
        OR (v_order.status = 'awaiting_confirmation' AND p_status IN ('confirmed', 'cancelled'))
        OR (v_order.status = 'confirmed' AND p_status IN ('packing', 'cancelled'))
        OR (v_order.status = 'packing' AND p_status IN ('shipped', 'cancelled'))
        OR (v_order.status = 'shipped' AND p_status = 'completed')
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Order status transition is not allowed.';
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

CREATE OR REPLACE FUNCTION rockmerch_create_first_admin(
    p_email TEXT,
    p_password_hash TEXT
)
RETURNS TABLE(email TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(739121, 1);
    IF EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN
        RETURN;
    END IF;

    RETURN QUERY
    INSERT INTO users(email, password, role)
    VALUES (lower(p_email), p_password_hash, 'admin')
    RETURNING users.email;
END;
$$;

INSERT INTO schema_migrations(version)
VALUES ('004_admin_safety')
ON CONFLICT (version) DO NOTHING;
