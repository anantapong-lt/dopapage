BEGIN;

ALTER TABLE stories
  ADD COLUMN alternative_title VARCHAR(120);

COMMIT;
