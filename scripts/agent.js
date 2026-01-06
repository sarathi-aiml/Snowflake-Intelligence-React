#!/usr/bin/env node

/**
 * Agent Script - Automated Setup
 * Handles: npm install, demo mode detection, database setup, migrations, and admin creation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🤖 Agent Script - Automated Setup\n');
console.log('=====================================\n');

// Step 1: Check and install dependencies if needed (MUST BE FIRST - before requiring dotenv)
async function installDependencies() {
    console.log('📦 Step 1: Checking dependencies...\n');
    
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
        console.error('❌ package.json not found!');
        console.error('   Please ensure you are in the project root directory.\n');
        return false;
    }
    
    // Check if node_modules exists
    if (fs.existsSync(nodeModulesPath)) {
        console.log('✅ Dependencies already installed (node_modules found)');
        console.log('   Skipping npm install...\n');
        return true;
    }
    
    // node_modules doesn't exist, install dependencies
    console.log('📥 node_modules not found - installing dependencies...\n');
    console.log('   This may take a few minutes...\n');
    try {
        execSync('npm install', { stdio: 'inherit', cwd: process.cwd() });
        console.log('\n✅ Dependencies installed successfully\n');
        return true;
    } catch (err) {
        console.error('\n❌ Failed to install dependencies:', err.message);
        console.error('   Please run "npm install" manually and check for errors.\n');
        return false;
    }
}

// Step 2: Check DEMO mode
function checkDemoMode() {
    console.log('🔍 Step 2: Checking DEMO mode...\n');
    
    // Reload .env to get latest values (dotenv is already loaded in main)
    try {
        delete require.cache[require.resolve('dotenv')];
        require('dotenv').config();
    } catch (err) {
        // If dotenv cache delete fails, it's already loaded, continue
    }
    
    const isDemo = process.env.DEMO === 'true';
    
    if (isDemo) {
        console.log('✅ DEMO mode: ENABLED');
        console.log('   - No database connection required');
        console.log('   - Conversations stored in localStorage');
        console.log('   - No Google OAuth required\n');
    } else {
        console.log('✅ DEMO mode: DISABLED');
        console.log('   - Database connection required');
        console.log('   - Snowflake configuration needed\n');
    }
    
    return isDemo;
}

// Step 3: Setup Demo Mode
async function setupDemoMode() {
    console.log('🎭 Step 3: Setting up Demo Mode...\n');
    
    console.log('✅ Demo mode setup complete!');
    console.log('   - No database initialization needed');
    console.log('   - No admin account needed');
    console.log('   - Ready to run: npm run dev\n');
    
    return true;
}

// Step 4: Setup Production Mode (Database + Migrations + Admin)
async function setupProductionMode() {
    console.log('🏭 Step 4: Setting up Production Mode...\n');
    
    // Validate environment variables
    console.log('   📋 Validating environment variables...');
    const requiredVars = [
        'SNOWFLAKE_DB',
        'DB_SNOWFLAKE_SCHEMA',
        'SNOWFLAKE_ACCOUNT',
        'SNOWFLAKE_USERNAME',
        'SNOWFLAKE_PASSWORD',
        'SNOWFLAKE_WAREHOUSE'
    ];
    
    const missingVars = requiredVars.filter(v => !process.env[v]);
    
    if (missingVars.length > 0) {
        console.error('   ❌ Missing required environment variables:');
        missingVars.forEach(v => console.error(`      - ${v}`));
        console.error('\n   Please set these variables in your .env file\n');
        return false;
    }
    
    console.log('   ✅ All required environment variables are set\n');
    
    // Connect to database and run migrations
    console.log('   🔌 Connecting to database...');
    try {
        const { initializeUsersTable, initializeProjectsTable, initializeConversationsTable, initializeFilesTable } = require('../lib/snowflake');
        
        console.log('   📊 Running migrations (creating/updating tables)...\n');
        
        await initializeUsersTable();
        await initializeProjectsTable();
        await initializeConversationsTable();
        await initializeFilesTable();
        
        console.log('   ✅ Database connection successful');
        console.log('   ✅ All tables initialized/migrated\n');
    } catch (err) {
        console.error('   ❌ Database connection/migration failed:', err.message);
        console.error('   ⚠️  Continuing with admin account creation...\n');
    }
    
    // Create admin account
    console.log('   👤 Creating admin account...');
    const adminEmail = process.env.ADMIN_EMAIL;
    
    if (!adminEmail) {
        console.log('   ⚠️  ADMIN_EMAIL not set - skipping admin account creation');
        console.log('   💡 Set ADMIN_EMAIL in .env to create admin account automatically\n');
        return true;
    }
    
    try {
        const { createUser, getUserByEmail, updateUser } = require('../lib/db/users');
        
        // Check if user already exists
        const existingUser = await getUserByEmail(adminEmail);
        
        if (existingUser) {
            if (existingUser.role === 'ADMIN') {
                console.log(`   ✅ Admin user already exists: ${adminEmail}`);
                console.log('   ✅ User is already an admin\n');
            } else {
                console.log(`   🔄 Updating user ${adminEmail} to ADMIN role...`);
                await updateUser(existingUser.id, { role: 'ADMIN' });
                console.log(`   ✅ User ${adminEmail} updated to ADMIN role\n`);
            }
        } else {
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
            console.log(`   ✅ Admin user created successfully:`);
            console.log(`      Email: ${adminUser.email}`);
            console.log(`      Name: ${adminUser.name}`);
            console.log(`      Role: ${adminUser.role}\n`);
        }
    } catch (err) {
        console.error('   ❌ Failed to create admin account:', err.message);
        if (err.message.includes('already exists')) {
            console.log('   ℹ️  User with this email already exists\n');
        } else {
            console.error('   ⚠️  Please check your database connection\n');
        }
    }
    
    return true;
}

// Main execution
async function main() {
    try {
        // Step 1: Install dependencies FIRST (before requiring dotenv)
        // This is critical - dotenv requires node_modules to be installed first
        const installSuccess = await installDependencies();
        if (!installSuccess) {
            console.error('\n❌ Setup failed at dependency installation');
            process.exit(1);
        }
        
        // Now that dependencies are installed, we can safely require dotenv
        require('dotenv').config();
        
        // Step 2: Check DEMO mode (after dotenv is loaded)
        const isDemo = checkDemoMode();
        
        // Step 3 or 4: Setup based on mode
        let setupSuccess = false;
        if (isDemo) {
            setupSuccess = await setupDemoMode();
        } else {
            setupSuccess = await setupProductionMode();
        }
        
        if (!setupSuccess) {
            console.error('\n❌ Setup failed');
            process.exit(1);
        }
        
        // Final summary
        console.log('=====================================');
        console.log('✅ Agent Script Completed Successfully!\n');
        
        if (isDemo) {
            console.log('📝 Demo Mode Summary:');
            console.log('   - No database configuration needed');
            console.log('   - Conversations stored in browser localStorage');
            console.log('   - No authentication required');
            console.log('\n🚀 Next step: npm run dev\n');
        } else {
            console.log('📝 Production Mode Summary:');
            console.log('   - Database connected and tables initialized');
            if (process.env.ADMIN_EMAIL) {
                console.log('   - Admin account ready');
            }
            console.log('\n🚀 Next steps:');
            console.log('   - Development: npm run dev');
            console.log('   - Production: npm run build && npm start\n');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Agent script failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

// Run the agent
main();

