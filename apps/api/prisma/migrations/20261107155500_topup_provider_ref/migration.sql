-- Provider ids are text, not UUIDs: name the column so the "*_id is a uuid" convention stays true.
ALTER TABLE "topup_orders" RENAME COLUMN "provider_transaction_id" TO "provider_tx_ref";
ALTER INDEX "topup_orders_provider_transaction_id_key" RENAME TO "topup_orders_provider_tx_ref_key";
