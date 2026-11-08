-- Migration: 00009_add_service_region.sql
-- Adds service_region to organizations to support the onboarding profile.

ALTER TABLE organizations ADD COLUMN service_region text;
