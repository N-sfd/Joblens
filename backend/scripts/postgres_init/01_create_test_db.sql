-- Runs only on first volume init. Creates isolated test database.
SELECT 'CREATE DATABASE joblens_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'joblens_test')\gexec
