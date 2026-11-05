-- Synthetic old-schema rows added to the dump copy, on the throwaway DB only (pre-migration shape).
INSERT INTO users (id, google_id, email, name) VALUES
 (9001,'g9001','legacy3@test.local','Legacy3'),(9002,'g9002','legacy12@test.local','Legacy12'),
 (9003,'g9003','legacy1@test.local','Legacy1'),(9004,'g9004','legacy8@test.local','Legacy8'),
 (9005,'g9005','legacy0@test.local','Legacy0'),(9006,'g9006','legacynull@test.local','LegacyNull'),
 (9007,'g9007','legacy2@test.local','Legacy2');
INSERT INTO player_stats (user_id, username, level, xp, coins, calories_burned) VALUES
 (9001,NULL,3,10,1000,700),(9002,NULL,12,10,50,0),(9003,NULL,1,0,7,0),(9004,NULL,8,5,0,0),
 (9005,NULL,0,0,3,0),(9006,NULL,NULL,0,4,0),(9007,NULL,2,99,5,0);
INSERT INTO buildings (type,asset_key,x,y,content,metadata,user_id) VALUES
 ('Shop','supermarket',840,216,'', '{"purchase_price":250}',9001),
 ('Decoration','cozy_bench',264,216,'','{}',9001),
 ('Decoration','garden_fountain',312,216,'','{}',9001),
 ('Savings','savings_project',360,264,'','{"stage":2,"savingsGoalId":77}',9001),
 ('Weird','mystery_thing',99999,-40,'','{}',9001),
 ('House','house',216,168,'Goal Archive: old','{}',9001),
 ('House','house',216,168,'same tile on purpose','{}',9001),
 ('House','house',3359,2399,'bottom-right corner','{}',9002),
 ('House','house',-10,-10,'negative','{}',9002),
 ('House','house',24,24,'null metadata',NULL,9003),
 ('Shop','supermarket',216.5,168.9,'fractional','{}',9007);
-- An orphan row from the single-player era, not adopted by anyone yet.
INSERT INTO buildings (type,asset_key,x,y,content,metadata,user_id) VALUES ('House','house',120,120,'orphan','{}',NULL);
INSERT INTO tasks (title,category,status,coins_earned,due_date,completed_at,building_id,user_id)
 SELECT 'old finished goal','Coding','completed',45,'2026-01-02','2026-01-02 10:00', id, 9001 FROM buildings WHERE content='Goal Archive: old';
INSERT INTO tasks (title,category,due_date,user_id) VALUES ('old pending goal','Fitness','2026-12-01',9001);
INSERT INTO recurring_tasks (title,category,user_id) VALUES ('old habit','Fitness',9001);
INSERT INTO savings_goals (user_id,title,target_cents,stage,created_on) VALUES (9001,'old goal',10000,2,'2026-01-02');
INSERT INTO transactions (user_id,amount_cents,direction,category,note,occurred_on,logged_on,reward_coins) VALUES (9001,500,'expense','Food','old note','2026-01-02','2026-01-02',5);
INSERT INTO friendships (requester_id,addressee_id,status) VALUES (9001,9002,'accepted');
