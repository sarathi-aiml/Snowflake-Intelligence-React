#!/usr/bin/env node

/**
 * Clear All Data Script
 * 
 * This script removes all data from all tables.
 * It does NOT drop tables - only deletes data.
 * WARNING: This will permanently delete all data!
 * 
 * Usage:
 *   npm run clear-data
 *   or
 *   node scripts/clear-data.js
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
        console.log('⏭️  Demo mode enabled - skipping data clearing');
        console.log('   Set DEMO=false to run data clearing\n');
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

async function getRowCount(db, schema, tableName) {
    try {
        const sql = `SELECT COUNT(*) FROM ${db}.${schema}.${tableName}`;
        const result = await executeSnowflakeSQL(sql);
        
        if (result.data && Array.isArray(result.data) && result.data.length > 0) {
            const row = result.data[0];
            if (Array.isArray(row) && row.length > 0) {
                return parseInt(row[0] || 0, 10);
            }
        }
        return 0;
    } catch (err) {
        // Table might not exist
        return -1;
    }
}

async function clearTable(db, schema, tableName) {
    try {
        // Get row count before deletion
        const countBefore = await getRowCount(db, schema, tableName);
        
        if (countBefore === -1) {
            console.log(`   ⚠️  Table ${tableName} does not exist, skipping`);
            return { success: false, skipped: true, countBefore: 0, countAfter: 0 };
        }
        
        if (countBefore === 0) {
            console.log(`   ℹ️  Table ${tableName} is already empty`);
            return { success: true, skipped: false, countBefore: 0, countAfter: 0 };
        }
        
        // Delete all rows
        const sql = `DELETE FROM ${db}.${schema}.${tableName}`;
        await executeSnowflakeSQL(sql);
        
        // Verify deletion
        const countAfter = await getRowCount(db, schema, tableName);
        
        if (countAfter === 0) {
            console.log(`   ✓ Cleared ${tableName} (${countBefore} rows deleted)`);
            return { success: true, skipped: false, countBefore, countAfter: 0 };
        } else {
            console.log(`   ⚠️  ${tableName} still has ${countAfter} rows (expected 0)`);
            return { success: false, skipped: false, countBefore, countAfter };
        }
    } catch (err) {
        console.error(`   ❌ Failed to clear ${tableName}: ${err.message}`);
        return { success: false, skipped: false, error: err.message };
    }
}

async function clearAllData(db, schema) {
    console.log('🗑️  Clearing all data from tables...\n');
    console.log('⚠️  WARNING: This will permanently delete all data!\n');
    
    // Clear in reverse dependency order to avoid foreign key issues
    // (though Snowflake doesn't enforce foreign keys, this is good practice)
    const tables = [
        { name: 'UPLOADED_FILE_CHUNKS', description: 'File chunks' },
        { name: 'UPLOADED_FILES', description: 'Uploaded files' },
        { name: 'CONVERSATIONS', description: 'Conversations' },
        { name: 'PROJECTS', description: 'Projects' },
        { name: 'USERS', description: 'Users' }
    ];
    
    const results = [];
    let totalRowsDeleted = 0;
    
    for (const table of tables) {
        console.log(`Clearing ${table.description} (${table.name})...`);
        const result = await clearTable(db, schema, table.name);
        results.push({ ...result, tableName: table.name, description: table.description });
        
        if (result.success && !result.skipped) {
            totalRowsDeleted += result.countBefore;
        }
        console.log('');
    }
    
    return { results, totalRowsDeleted };
}

async function verifyDataCleared(db, schema) {
    console.log('✅ Verifying all data is cleared...\n');
    
    const tables = [
        'USERS',
        'PROJECTS',
        'CONVERSATIONS',
        'UPLOADED_FILES',
        'UPLOADED_FILE_CHUNKS'
    ];
    
    let allCleared = true;
    const counts = {};
    
    for (const table of tables) {
        try {
            const count = await getRowCount(db, schema, table);
            counts[table] = count;
            
            if (count === -1) {
                console.log(`   ⚠️  ${table} does not exist`);
            } else if (count === 0) {
                console.log(`   ✓ ${table} is empty`);
            } else {
                console.error(`   ❌ ${table} still has ${count} rows`);
                allCleared = false;
            }
        } catch (err) {
            console.error(`   ❌ ${table} verification failed: ${err.message}`);
            allCleared = false;
        }
    }
    
    console.log('');
    return { allCleared, counts };
}

async function main() {
    console.log('🚀 Starting data clearing process...\n');
    console.log('⚠️  WARNING: This will DELETE ALL DATA from all tables!');
    console.log('   Tables will be preserved, but all rows will be deleted.\n');
    
    // Validate environment
    const validation = await validateEnvironment();
    
    if (validation.skip) {
        process.exit(0);
    }
    
    if (!validation.valid) {
        console.error('❌ Data clearing failed: Environment validation failed\n');
        process.exit(1);
    }
    
    const { db, schema } = validation;
    
    try {
        // Step 1: Clear all data
        const { results, totalRowsDeleted } = await clearAllData(db, schema);
        
        // Step 2: Verify all data is cleared
        const { allCleared, counts } = await verifyDataCleared(db, schema);
        
        // Step 3: Summary
        console.log('📊 Summary:\n');
        console.log(`   - Database: ${db}`);
        console.log(`   - Schema: ${schema}`);
        console.log(`   - Total rows deleted: ${totalRowsDeleted}`);
        console.log('   - Tables cleared:');
        
        results.forEach(result => {
            if (result.skipped) {
                console.log(`     ⚠️  ${result.description} (${result.tableName}): Skipped - table does not exist`);
            } else if (result.success) {
                console.log(`     ✓ ${result.description} (${result.tableName}): ${result.countBefore} rows deleted`);
            } else {
                console.log(`     ❌ ${result.description} (${result.tableName}): Failed - ${result.error || 'Unknown error'}`);
            }
        });
        
        console.log('');
        
        if (allCleared) {
            console.log('✅ All data cleared successfully!\n');
            console.log('   All tables are now empty and ready for fresh data.\n');
        } else {
            console.error('⚠️  Data clearing completed with warnings\n');
            console.error('   Some tables may still contain data. Please review the errors above.\n');
            process.exit(1);
        }
        
    } catch (err) {
        console.error('\n❌ Data clearing failed with error:', err.message);
        console.error('   Stack:', err.stack);
        console.error('\n');
        process.exit(1);
    }
}

// Run data clearing
main().catch(err => {
    console.error('\n❌ Data clearing failed:', err);
    process.exit(1);
});

