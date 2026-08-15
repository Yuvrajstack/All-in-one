-- ============================================================
-- PAC — Add WhatsApp & Extended Sources Migration
-- Migration: 002_add_whatsapp_source.sql
-- ============================================================

-- Drop old check constraint on memories source if exists and update constraint
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_source_check;

ALTER TABLE memories ADD CONSTRAINT memories_source_check 
  CHECK (source IN ('gmail', 'github', 'calendar', 'manual', 'whatsapp', 'document', 'delivery', 'job'));
