-- Purge all documents and cascade-deleted rows (DocumentField, DocumentRecipient, AuditLog).
-- Preserves User and Organization rows so sign-in still works.
-- Run only after removing S3 objects under clinics/ if you want no orphaned keys.
DELETE FROM "Document";
