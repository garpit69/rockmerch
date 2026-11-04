CREATE INDEX IF NOT EXISTS idx_orders_number_email
    ON orders(order_number, lower(email));

CREATE INDEX IF NOT EXISTS idx_product_reviews_published
    ON product_reviews(product_id, created_at DESC)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_product_views_recent
    ON product_views(viewed_at DESC, product_id);

CREATE INDEX IF NOT EXISTS idx_search_terms_recent
    ON search_terms(searched_at DESC);

CREATE INDEX IF NOT EXISTS idx_articles_publication
    ON articles(status, publish_at DESC, created_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('005_public_parity')
ON CONFLICT (version) DO NOTHING;
