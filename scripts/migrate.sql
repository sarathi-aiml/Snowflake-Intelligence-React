-- Database Migration SQL Script
-- 
-- This script drops all existing tables and recreates them from scratch.
-- WARNING: This will delete all existing data!
--
-- Usage:
--   1. Replace {DB} and {SCHEMA} with your actual database and schema names
--   2. Run this script in Snowflake SQL editor or via SnowSQL
--
-- Example:
--   Replace {DB} with: MY_DATABASE
--   Replace {SCHEMA} with: MY_SCHEMA

-- ============================================
-- STEP 1: Drop all existing tables
-- ============================================

DROP TABLE IF EXISTS {DB}.{SCHEMA}.UPLOADED_FILE_CHUNKS;
DROP TABLE IF EXISTS {DB}.{SCHEMA}.UPLOADED_FILES;
DROP TABLE IF EXISTS {DB}.{SCHEMA}.CONVERSATIONS;
DROP TABLE IF EXISTS {DB}.{SCHEMA}.PROJECTS;
DROP TABLE IF EXISTS {DB}.{SCHEMA}.USERS;

-- ============================================
-- STEP 2: Create schema
-- ============================================

CREATE SCHEMA IF NOT EXISTS {DB}.{SCHEMA};

-- ============================================
-- STEP 3: Create tables
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS {DB}.{SCHEMA}.users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(500),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    company_name VARCHAR(500),
    address VARCHAR(1000),
    phone VARCHAR(50),
    enable_google_login BOOLEAN DEFAULT FALSE,
    picture VARCHAR(1000),
    role VARCHAR(50) DEFAULT 'USER',
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    last_login TIMESTAMP_NTZ
);

-- Projects table
CREATE TABLE IF NOT EXISTS {DB}.{SCHEMA}.projects (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    description VARCHAR(2000),
    created_by VARCHAR(255),
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS {DB}.{SCHEMA}.conversations (
    conversation_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    project_id VARCHAR(255),
    session_id VARCHAR(255),
    title VARCHAR(500),
    messages VARIANT,
    is_liked BOOLEAN DEFAULT FALSE,
    feedback VARCHAR(2000),
    feedback_submitted_at TIMESTAMP_NTZ,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Uploaded files table
CREATE TABLE IF NOT EXISTS {DB}.{SCHEMA}.uploaded_files (
    file_id VARCHAR(255) PRIMARY KEY,
    conversation_id VARCHAR(255),
    session_id VARCHAR(255),
    filename VARCHAR(500),
    file_content VARIANT,
    file_size INTEGER,
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    is_chunked BOOLEAN DEFAULT FALSE,
    chunk_count INTEGER DEFAULT 0
);

-- Uploaded file chunks table
CREATE TABLE IF NOT EXISTS {DB}.{SCHEMA}.uploaded_file_chunks (
    file_id VARCHAR(255),
    chunk_index INTEGER,
    chunk_content VARIANT,
    PRIMARY KEY (file_id, chunk_index)
);

-- ============================================
-- STEP 4: Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_conversations_user_id 
ON {DB}.{SCHEMA}.conversations (user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_project_id 
ON {DB}.{SCHEMA}.conversations (project_id);

-- Set clustering on users.email (if supported)
-- Note: This may fail for non-hybrid tables, which is fine
ALTER TABLE {DB}.{SCHEMA}.users CLUSTER BY (email);

-- ============================================
-- STEP 5: Verification queries
-- ============================================

-- Verify all tables exist
SELECT 'USERS' as table_name, COUNT(*) as row_count FROM {DB}.{SCHEMA}.users
UNION ALL
SELECT 'PROJECTS', COUNT(*) FROM {DB}.{SCHEMA}.projects
UNION ALL
SELECT 'CONVERSATIONS', COUNT(*) FROM {DB}.{SCHEMA}.conversations
UNION ALL
SELECT 'UPLOADED_FILES', COUNT(*) FROM {DB}.{SCHEMA}.uploaded_files
UNION ALL
SELECT 'UPLOADED_FILE_CHUNKS', COUNT(*) FROM {DB}.{SCHEMA}.uploaded_file_chunks;

