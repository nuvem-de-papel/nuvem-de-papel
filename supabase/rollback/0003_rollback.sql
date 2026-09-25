-- Rollback 0003 — remove orders antes de customers (FK).
drop table if exists orders;
drop table if exists campaigns;
drop table if exists customers;
