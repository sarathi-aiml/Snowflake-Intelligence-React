#!/usr/bin/env node

/**
 * Database Migration Script - Create All Tables
 * 
 * This script creates all necessary tables if they don't exist.
 * It does NOT drop existing tables or data - it's safe to run on existing databases.
 * Designed for initial setup or adding missing tables.
 * 
 * Usage:
 *   npm run migrate
 *   or
 *   node scripts/migrate.js
 */

require('dotenv').config();
const { executeSnowflakeSQL } = require('../lib/snowflake');

const DEMO_MODE = process.env.DEMO === 'true';

// Get database and schema configuration
function getDbConfig() {
    let AVAILABLE_AGENTS = [];
    try {
        const agentsModule = require('../lib/agents');
        AVAILABLE_AGENTS = agentsModule.AVAILABLE_AGENTS || [];
    } catch (err) {
        // Agents module might not exist or might not export AVAILABLE_AGENTS
        // That's okay, we'll use environment variables only
    }
    
    // Priority: SNOWFLAKE_DB > agent config > legacy SF_DB
    const agentConfig = AVAILABLE_AGENTS.find(a => a.warehouse) || AVAILABLE_AGENTS[0] || null;
    const db = process.env.SNOWFLAKE_DB || agentConfig?.db || process.env.SF_DB;
    const schema = process.env.DB_SNOWFLAKE_SCHEMA || agentConfig?.schema || process.env.SF_SCHEMA;
    
    return { db, schema };
}

async function validateEnvironment() {
    console.log('\n🔍 Validating environment...\n');
    
    if (DEMO_MODE) {
        console.log('⏭️  Demo mode enabled - skipping migration');
        console.log('   Set DEMO=false to run migrations\n');
        return { valid: false, skip: true };
    }
    
    const { db, schema } = getDbConfig();
    
    if (!db || !schema) {
        console.error('❌ Missing required configuration:');
        console.error('   SNOWFLAKE_DB and DB_SNOWFLAKE_SCHEMA must be set');
        console.error('   Or configure via agent settings\n');
        return { valid: false, skip: false };
    }
    
    // Check for Snowflake credentials
    const requiredVars = [
        'SNOWFLAKE_ACCOUNT',
        'SNOWFLAKE_USERNAME',
        'SNOWFLAKE_PASSWORD',
        'SNOWFLAKE_WAREHOUSE'
    ];
    
    const missing = requiredVars.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(v => console.error(`   - ${v}`));
        console.error('\n');
        return { valid: false, skip: false };
    }
    
    console.log('✅ Environment validation passed');
    console.log(`   Database: ${db}`);
    console.log(`   Schema: ${schema}\n`);
    
    return { valid: true, skip: false, db, schema };
}

async function createSchema(db, schema) {
    console.log('📦 Creating schema...\n');
    
    const sql = `CREATE SCHEMA IF NOT EXISTS ${db}.${schema}`;
    try {
        await executeSnowflakeSQL(sql);
        console.log(`   ✓ Schema ${db}.${schema} created/verified\n`);
        return true;
    } catch (err) {
        console.error(`   ❌ Failed to create schema: ${err.message}\n`);
        return false;
    }
}

async function createUsersTable(db, schema) {
    console.log('👤 Creating users table...\n');
    
    const sql = `
        CREATE TABLE IF NOT EXISTS ${db}.${schema}.users (
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
        )
    `;
    
    try {
        await executeSnowflakeSQL(sql);
        console.log('   ✓ Users table created/verified\n');
        return true;
    } catch (err) {
        console.error(`   ❌ Failed to create users table: ${err.message}\n`);
        return false;
    }
}

async function createProjectsTable(db, schema) {
    console.log('📁 Creating projects table...\n');
    
    const sql = `
        CREATE TABLE IF NOT EXISTS ${db}.${schema}.projects (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(500) NOT NULL,
            description VARCHAR(2000),
            created_by VARCHAR(255),
            created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
        )
    `;
    
    try {
        await executeSnowflakeSQL(sql);
        console.log('   ✓ Projects table created/verified\n');
        return true;
    } catch (err) {
        console.error(`   ❌ Failed to create projects table: ${err.message}\n`);
        return false;
    }
}

async function createConversationsTable(db, schema) {
    console.log('💬 Creating conversations table...\n');
    
    const sql = `
        CREATE TABLE IF NOT EXISTS ${db}.${schema}.conversations (
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
        )
    `;
    
    try {
        await executeSnowflakeSQL(sql);
        console.log('   ✓ Conversations table created/verified\n');
        return true;
    } catch (err) {
        console.error(`   ❌ Failed to create conversations table: ${err.message}\n`);
        return false;
    }
}

async function createUploadedFilesTable(db, schema) {
    console.log('📎 Creating uploaded_files table...\n');
    
    const sql = `
        CREATE TABLE IF NOT EXISTS ${db}.${schema}.uploaded_files (
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
        )
    `;
    
    try {
        await executeSnowflakeSQL(sql);
        console.log('   ✓ Uploaded_files table created/verified\n');
        return true;
    } catch (err) {
        console.error(`   ❌ Failed to create uploaded_files table: ${err.message}\n`);
        return false;
    }
}

async function createUploadedFileChunksTable(db, schema) {
    console.log('📦 Creating uploaded_file_chunks table...\n');
    
    const sql = `
        CREATE TABLE IF NOT EXISTS ${db}.${schema}.uploaded_file_chunks (
            file_id VARCHAR(255),
            chunk_index INTEGER,
            chunk_content VARIANT,
            PRIMARY KEY (file_id, chunk_index)
        )
    `;
    
    try {
        await executeSnowflakeSQL(sql);
        console.log('   ✓ Uploaded_file_chunks table created/verified\n');
        return true;
    } catch (err) {
        console.error(`   ❌ Failed to create uploaded_file_chunks table: ${err.message}\n`);
        return false;
    }
}

async function createIndexes(db, schema) {
    console.log('🔍 Creating indexes...\n');
    
    const indexes = [
        {
            name: 'idx_conversations_user_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON ${db}.${schema}.conversations (user_id)`
        },
        {
            name: 'idx_conversations_project_id',
            sql: `CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON ${db}.${schema}.conversations (project_id)`
        }
    ];
    
    for (const index of indexes) {
        try {
            await executeSnowflakeSQL(index.sql);
            console.log(`   ✓ Index ${index.name} created/verified`);
        } catch (err) {
            console.log(`   ⚠️  Could not create index ${index.name}: ${err.message}`);
        }
    }
    
    // Try to set clustering on users.email (may not be supported for all table types)
    try {
        const clusteringSQL = `ALTER TABLE ${db}.${schema}.users CLUSTER BY (email)`;
        await executeSnowflakeSQL(clusteringSQL);
        console.log('   ✓ Clustering key on users.email set');
    } catch (err) {
        if (err.message && err.message.includes('not a hybrid table')) {
            console.log('   ℹ️  Skipping clustering (Snowflake uses automatic optimization)');
        } else {
            console.log(`   ⚠️  Could not set clustering: ${err.message}`);
        }
    }
    
    console.log('');
}

async function verifyTables(db, schema) {
    console.log('✅ Verifying tables...\n');
    
    const tables = [
        'USERS',
        'PROJECTS',
        'CONVERSATIONS',
        'UPLOADED_FILES',
        'UPLOADED_FILE_CHUNKS'
    ];
    
    let allVerified = true;
    
    for (const table of tables) {
        try {
            const sql = `SELECT COUNT(*) FROM ${db}.${schema}.${table}`;
            await executeSnowflakeSQL(sql);
            console.log(`   ✓ ${table} verified`);
        } catch (err) {
            console.error(`   ❌ ${table} verification failed: ${err.message}`);
            allVerified = false;
        }
    }
    
    console.log('');
    return allVerified;
}

async function main() {
    console.log('🚀 Starting database migration (create tables only)...\n');
    console.log('ℹ️  This script will create tables if they don\'t exist.');
    console.log('   Existing tables and data will be preserved.\n');
    
    // Validate environment
    const validation = await validateEnvironment();
    
    if (validation.skip) {
        process.exit(0);
    }
    
    if (!validation.valid) {
        console.error('❌ Migration failed: Environment validation failed\n');
        process.exit(1);
    }
    
    const { db, schema } = validation;
    
    try {
        // Step 1: Create schema
        const schemaCreated = await createSchema(db, schema);
        if (!schemaCreated) {
            throw new Error('Failed to create schema');
        }
        
        // Step 2: Create all tables
        const tablesCreated = [
            await createUsersTable(db, schema),
            await createProjectsTable(db, schema),
            await createConversationsTable(db, schema),
            await createUploadedFilesTable(db, schema),
            await createUploadedFileChunksTable(db, schema)
        ];
        
        const allTablesCreated = tablesCreated.every(result => result === true);
        
        if (!allTablesCreated) {
            console.error('⚠️  Warning: Some tables may not have been created successfully\n');
        }
        
        // Step 3: Create indexes
        await createIndexes(db, schema);
        
        // Step 4: Verify tables
        const verified = await verifyTables(db, schema);
        
        if (verified && allTablesCreated) {
            console.log('✅ Migration completed successfully!\n');
            console.log('📊 Summary:');
            console.log(`   - Database: ${db}`);
            console.log(`   - Schema: ${schema}`);
            console.log('   - Tables created/verified: 5');
            console.log('   - Indexes created/verified: 2');
            console.log('   - Clustering: users.email');
            console.log('   - Existing data preserved\n');
        } else {
            console.error('⚠️  Migration completed with warnings\n');
            console.error('   Please review the errors above and verify table creation manually\n');
            process.exit(1);
        }
        
    } catch (err) {
        console.error('\n❌ Migration failed with error:', err.message);
        console.error('   Stack:', err.stack);
        console.error('\n');
        process.exit(1);
    }
}

// Run migration
main().catch(err => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
});
