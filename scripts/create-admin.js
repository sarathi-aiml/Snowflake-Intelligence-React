#!/usr/bin/env node

/**
 * Create admin user script
 * Creates an admin user from environment variables
 */

require('dotenv').config();
const { createUser, getUserByEmail, updateUser } = require('../lib/db/users');

const DEMO_MODE = process.env.DEMO === 'true';

async function createAdmin() {
    if (DEMO_MODE) {
        console.log('⏭️  Demo mode enabled - admin user creation skipped');
        console.log('   In demo mode, authentication is not required\n');
        process.exit(0);
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        console.error('❌ ADMIN_EMAIL environment variable is required');
        console.error('   Set ADMIN_EMAIL in your .env file\n');
        process.exit(1);
    }

    console.log(`👤 Creating admin user: ${adminEmail}\n`);

    try {
        // Check if user already exists
        const existingUser = await getUserByEmail(adminEmail);
        if (existingUser) {
            console.log(`ℹ️  User already exists: ${adminEmail}`);
            
            if (existingUser.role === 'ADMIN') {
                console.log(`✅ User ${adminEmail} is already an admin\n`);
                process.exit(0);
            } else {
                // Update to admin role
                console.log(`🔄 Updating user ${adminEmail} to ADMIN role...`);
                await updateUser(existingUser.id, { role: 'ADMIN' });
                console.log(`✅ User ${adminEmail} updated to ADMIN role\n`);
                process.exit(0);
            }
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
        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to create admin user:', err.message);
        if (err.message.includes('already exists')) {
            console.error('   User with this email already exists\n');
        } else {
            console.error('   Please check your Snowflake configuration\n');
        }
        process.exit(1);
    }
}

// Run admin creation
createAdmin().catch(err => {
    console.error('\n❌ Admin creation failed:', err);
    process.exit(1);
});

