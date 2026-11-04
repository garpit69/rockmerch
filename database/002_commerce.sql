ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
    ON orders(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION rockmerch_create_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_customer_name TEXT := btrim(payload->>'customer_name');
    v_email TEXT := lower(btrim(payload->>'email'));
    v_phone TEXT := btrim(payload->>'phone');
    v_address TEXT := btrim(payload->>'address');
    v_city TEXT := btrim(payload->>'city');
    v_postal_code TEXT := btrim(payload->>'postal_code');
    v_notes TEXT := btrim(COALESCE(payload->>'notes', ''));
    v_idempotency_key TEXT := payload->>'idempotency_key';
    v_bank_code TEXT := payload->>'bank_code';
    v_bank_account TEXT := payload->>'bank_account';
    v_account_name TEXT := payload->>'account_name';
    v_items JSONB := payload->'items';
    v_order_items JSONB := '[]'::jsonb;
    v_line JSONB;
    v_product products%ROWTYPE;
    v_format JSONB;
    v_product_id BIGINT;
    v_format_name TEXT;
    v_quantity INTEGER;
    v_unit_price BIGINT;
    v_stock INTEGER;
    v_subtotal BIGINT := 0;
    v_shipping_fee BIGINT := (payload->>'shipping_fee')::BIGINT;
    v_free_shipping_threshold BIGINT := (payload->>'free_shipping_threshold')::BIGINT;
    v_shipping BIGINT;
    v_total BIGINT;
    v_order_number TEXT;
    v_existing orders%ROWTYPE;
    v_order_id BIGINT;
BEGIN
    IF payload IS NULL
       OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
       OR COALESCE(v_customer_name, '') = ''
       OR v_email IS NULL
       OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       OR COALESCE(v_phone, '') = ''
       OR COALESCE(v_address, '') = ''
       OR COALESCE(v_city, '') = ''
       OR COALESCE(v_postal_code, '') = ''
       OR COALESCE(v_bank_code, '') = ''
       OR COALESCE(v_bank_account, '') = ''
       OR COALESCE(v_account_name, '') = ''
       OR v_shipping_fee IS NULL
       OR v_free_shipping_threshold IS NULL
       OR v_shipping_fee < 0
       OR v_free_shipping_threshold < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Checkout data is invalid.';
    END IF;

    IF length(v_customer_name) > 160
       OR length(v_email) > 254
       OR length(v_phone) > 40
       OR length(v_address) > 1000
       OR length(v_city) > 120
       OR length(v_postal_code) > 20
       OR length(v_notes) > 1000
       OR v_idempotency_key IS NULL
       OR v_idempotency_key !~ '^[0-9a-fA-F-]{36}$' THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Checkout data is invalid.';
    END IF;

    IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Checkout data is invalid.';
    END IF;
    IF jsonb_array_length(v_items) < 1 OR jsonb_array_length(v_items) > 20 THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Checkout data is invalid.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_items) AS requested(item)
        WHERE COALESCE(requested.item->>'product_id', '') !~ '^[1-9][0-9]{0,17}$'
           OR COALESCE(requested.item->>'quantity', '') !~ '^[0-9]{1,2}$'
           OR COALESCE(btrim(requested.item->>'format'), '') = ''
           OR length(requested.item->>'format') > 80
    ) OR (
        SELECT count(*) <> count(DISTINCT
            (requested.item->>'product_id') || '|' || (requested.item->>'format'))
        FROM jsonb_array_elements(v_items) AS requested(item)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Cart item is invalid.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_idempotency_key, 0));

    SELECT * INTO v_existing
    FROM orders
    WHERE idempotency_key = v_idempotency_key;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'order_number', v_existing.order_number,
            'subtotal', v_existing.subtotal,
            'shipping', v_existing.shipping,
            'total', v_existing.total,
            'transfer_bank_code', v_existing.transfer_bank_code,
            'transfer_bank_account', v_existing.transfer_bank_account,
            'transfer_account_name', v_existing.transfer_account_name
        );
    END IF;

    PERFORM p.id
    FROM products AS p
    WHERE p.id IN (
        SELECT DISTINCT (requested.item->>'product_id')::BIGINT
        FROM jsonb_array_elements(v_items) AS requested(item)
    )
    ORDER BY p.id
    FOR UPDATE;

    FOR v_line IN SELECT value FROM jsonb_array_elements(v_items)
    LOOP
        v_product_id := (v_line->>'product_id')::BIGINT;
        v_quantity := (v_line->>'quantity')::INTEGER;
        v_format_name := btrim(v_line->>'format');

        IF v_quantity < 1 OR v_quantity > 10 OR length(v_format_name) > 80 THEN
            RAISE EXCEPTION USING ERRCODE = 'R0001', MESSAGE = 'Cart item is invalid.';
        END IF;

        SELECT * INTO v_product
        FROM products
        WHERE id = v_product_id AND status = 'published'
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = 'R0002', MESSAGE = 'A product is no longer available.';
        END IF;

        SELECT value INTO v_format
        FROM jsonb_array_elements(v_product.formats) AS value
        WHERE COALESCE(value->>'format', value->>'name') = v_format_name
        LIMIT 1;

        IF v_format IS NULL
           OR COALESCE(v_format->>'price', '') !~ '^[0-9]{1,12}$'
           OR COALESCE(v_format->>'stock', '') !~ '^[0-9]{1,9}$' THEN
            RAISE EXCEPTION USING ERRCODE = 'R0002', MESSAGE = 'The selected format is unavailable.';
        END IF;

        v_unit_price := (v_format->>'price')::BIGINT;
        v_stock := (v_format->>'stock')::INTEGER;
        IF v_stock < v_quantity THEN
            RAISE EXCEPTION USING ERRCODE = 'R0002', MESSAGE = 'There is not enough stock.';
        END IF;

        UPDATE products AS p
        SET formats = (
            SELECT jsonb_agg(
                CASE
                    WHEN COALESCE(entry.value->>'format', entry.value->>'name') = v_format_name
                    THEN jsonb_set(entry.value, '{stock}', to_jsonb(v_stock - v_quantity), FALSE)
                    ELSE entry.value
                END
                ORDER BY entry.ordinality
            )
            FROM jsonb_array_elements(p.formats) WITH ORDINALITY AS entry(value, ordinality)
        )
        WHERE p.id = v_product_id;

        v_subtotal := v_subtotal + (v_unit_price * v_quantity);
        v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
            'product_id', v_product_id,
            'title', v_product.title,
            'format', v_format_name,
            'unit_price', v_unit_price,
            'quantity', v_quantity
        ));
    END LOOP;

    v_shipping := CASE
        WHEN v_subtotal >= v_free_shipping_threshold THEN 0
        ELSE v_shipping_fee
    END;
    v_total := v_subtotal + v_shipping;
    v_order_number := 'RM-'
        || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYMMDD')
        || '-'
        || upper(replace(gen_random_uuid()::TEXT, '-', ''));

    INSERT INTO orders (
        order_number, idempotency_key, customer_name, email, phone, address,
        city, postal_code, notes, subtotal, shipping, total, payment_method,
        status, transfer_bank_code, transfer_bank_account, transfer_account_name
    )
    VALUES (
        v_order_number, v_idempotency_key, v_customer_name, v_email, v_phone,
        v_address, v_city, v_postal_code, v_notes, v_subtotal, v_shipping,
        v_total, 'bank_transfer', 'awaiting_payment', v_bank_code,
        v_bank_account, v_account_name
    )
    RETURNING id INTO v_order_id;

    INSERT INTO order_items (order_id, product_id, title, format, unit_price, quantity)
    SELECT
        v_order_id,
        (item->>'product_id')::BIGINT,
        item->>'title',
        item->>'format',
        (item->>'unit_price')::BIGINT,
        (item->>'quantity')::INTEGER
    FROM jsonb_array_elements(v_order_items) AS item;

    RETURN jsonb_build_object(
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'shipping', v_shipping,
        'total', v_total,
        'transfer_bank_code', v_bank_code,
        'transfer_bank_account', v_bank_account,
        'transfer_account_name', v_account_name
    );
END;
$$;

INSERT INTO schema_migrations(version)
VALUES ('002_commerce')
ON CONFLICT (version) DO NOTHING;
