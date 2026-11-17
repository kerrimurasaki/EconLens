-- Dev helper: removes data created by manual smoke runs and Playwright (keeps the seeded sample, which is isDemo=true,
-- and the seeded DEMO2026 class).
DELETE FROM "Assignment" WHERE "experienceId" IN (SELECT id FROM "Experience" WHERE "isDemo" = false);
DELETE FROM "Experience" WHERE "isDemo" = false;
DELETE FROM "EventCase" WHERE "isDemo" = false;
DELETE FROM "Classroom" WHERE "joinCode" <> 'DEMO2026';
