#!/usr/bin/env node

/**
 * Setup script for Next.js AI App
 * Validates environment variables, initializes Snowflake tables, and creates admin user
 */

require('dotenv').config();
const { initializeUsersTable, initializeProjectsTable, initializeConversationsTable, initializeFilesTable } = require('../lib/snowflake');
const { createUser, getUserByEmail } = require('../lib/db/users');

const DEMO_MODE = process.env.DEMO === 'true';

async function validateEnvironment() {
    console.log('\n🔍 Validating environment variables...\n');

    const errors = [];
    const warnings = [];

    // Check demo mode
    if (DEMO_MODE) {
        console.log('✅ Demo mode enabled - skipping database initialization');
        return { valid: true, errors: [], warnings: ['Demo mode: Database operations will be skipped'] };
    }

    // Required environment variables for non-demo mode
    const requiredVars = [
        'SNOWFLAKE_DB',
        'DB_SNOWFLAKE_SCHEMA',
        'SNOWFLAKE_ACCOUNT',
        'SNOWFLAKE_USERNAME',
        'SNOWFLAKE_PASSWORD',
        'SNOWFLAKE_WAREHOUSE'
    ];

    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            errors.push(`Missing required environment variable: ${varName}`);
        }
    }

    // Optional but recommended
    if (!process.env.JWT_SECRET) {
        warnings.push('JWT_SECRET not set - using default (not recommended for production)');
    }

    if (errors.length > 0) {
        console.error('❌ Environment validation failed:\n');
        errors.forEach(err => console.error(`  - ${err}`));
        return { valid: false, errors, warnings };
    }

    if (warnings.length > 0) {
        console.log('⚠️  Warnings:\n');
        warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    console.log('✅ Environment validation passed\n');
    return { valid: true, errors: [], warnings };
}

async function initializeTables() {
    if (DEMO_MODE) {
        console.log('⏭️  Skipping table initialization (demo mode)\n');
        return true;
    }

    console.log('📊 Initializing Snowflake tables...\n');

    try {
        await initializeUsersTable();
        await initializeProjectsTable();
        await initializeConversationsTable();
        await initializeFilesTable();
        console.log('✅ All tables initialized successfully\n');
        return true;
    } catch (err) {
        console.error('❌ Failed to initialize tables:', err.message);
        console.error('   This may be expected if tables already exist or Snowflake is not configured\n');
        return false;
    }
}

async function createAdminUser() {
    if (DEMO_MODE) {
        console.log('⏭️  Skipping admin user creation (demo mode)\n');
        return true;
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        console.log('⏭️  Skipping admin user creation (ADMIN_EMAIL not set)\n');
        return true;
    }

    console.log('👤 Creating admin user...\n');

    try {
        // Check if admin user already exists
        const existingUser = await getUserByEmail(adminEmail);
        if (existingUser) {
            console.log(`ℹ️  Admin user already exists: ${adminEmail}`);
            // Update to admin role if not already admin
            if (existingUser.role !== 'ADMIN') {
                const { updateUser } = require('../lib/db/users');
                await updateUser(existingUser.id, { role: 'ADMIN' });
                console.log(`✅ Updated user ${adminEmail} to ADMIN role\n`);
            } else {
                console.log(`✅ User ${adminEmail} is already an admin\n`);
            }
            return true;
        }

        // Create new admin user
        const adminData = {
            email: adminEmail,
            firstName: process.env.ADMIN_FIRST_NAME || 'Admin',
            lastName: process.env.ADMIN_LAST_NAME || 'User',
            name: process.env.ADMIN_NAME || `${process.env.ADMIN_FIRST_NAME || 'Admin'} ${process.env.ADMIN_LAST_NAME || 'User'}`,
            companyName: process.env.ADMIN_COMPANY_NAME || 'Admin',
            phone: process.env.ADMIN_PHONE || '000-000-0000',
            address: process.env.ADMIN_ADDRESS || null,
            enableGoogleLogin: false,
            role: 'ADMIN'
        };

        const adminUser = await createUser(adminData);
        console.log(`✅ Admin user created successfully:`);
        console.log(`   Email: ${adminUser.email}`);
        console.log(`   Name: ${adminUser.name}`);
        console.log(`   Role: ${adminUser.role}\n`);
        return true;
    } catch (err) {
        console.error('❌ Failed to create admin user:', err.message);
        console.error('   This may be expected if user already exists\n');
        return false;
    }
}

async function main() {
    console.log('🚀 Starting setup...\n');

    // Validate environment
    const validation = await validateEnvironment();
    if (!validation.valid) {
        console.error('\n❌ Setup failed: Environment validation failed');
        process.exit(1);
    }

    // Initialize tables
    const tablesInitialized = await initializeTables();
    if (!tablesInitialized && !DEMO_MODE) {
        console.warn('⚠️  Warning: Table initialization failed, but continuing...\n');
    }

    // Create admin user
    const adminCreated = await createAdminUser();
    if (!adminCreated && !DEMO_MODE) {
        console.warn('⚠️  Warning: Admin user creation failed, but continuing...\n');
    }

    console.log('✅ Setup completed successfully!\n');

    if (DEMO_MODE) {
        console.log('📝 Demo mode is enabled:');
        console.log('   - No database connection required');
        console.log('   - Conversations stored in localStorage');
        console.log('   - No Google OAuth required\n');
    } else {
        console.log('📝 Next steps:');
        console.log('   1. Ensure all environment variables are set');
        console.log('   2. Run: npm run dev (for development)');
        console.log('   3. Run: npm start (for production)\n');
    }

    process.exit(0);
}

// Run setup
main().catch(err => {
    console.error('\n❌ Setup failed with error:', err);
    process.exit(1);
});

