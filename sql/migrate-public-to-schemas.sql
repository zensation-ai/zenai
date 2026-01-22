CREATE SCHEMA IF NOT EXISTS personal;
CREATE SCHEMA IF NOT EXISTS work;

DROP TABLE IF EXISTS personal.ideas CASCADE;
DROP TABLE IF EXISTS work.ideas CASCADE;

CREATE TABLE personal.ideas AS SELECT * FROM public.ideas WHERE 1=0;
CREATE TABLE work.ideas AS SELECT * FROM public.ideas WHERE 1=0;

ALTER TABLE personal.ideas ADD PRIMARY KEY (id);
ALTER TABLE work.ideas ADD PRIMARY KEY (id);

INSERT INTO personal.ideas
SELECT * FROM public.ideas
WHERE context = 'personal' OR context IS NULL;

INSERT INTO work.ideas
SELECT * FROM public.ideas
WHERE context = 'work';

SELECT 'public.ideas' as tbl, COUNT(*) as cnt FROM public.ideas
UNION ALL SELECT 'personal.ideas', COUNT(*) FROM personal.ideas
UNION ALL SELECT 'work.ideas', COUNT(*) FROM work.ideas;
