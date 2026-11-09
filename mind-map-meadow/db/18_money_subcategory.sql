-- A finer label under the category (Food -> Breakfast, Drinks ...). Optional, so old rows stay valid.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subcategory TEXT;
