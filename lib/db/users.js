/**
 * User database operations for Snowflake
 * Handles user creation, retrieval, and updates
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Escape SQL string to prevent SQL injection
 */
function escapeSQLString(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

/**
 * Map database row to user object (handles both old and new schema)
 * Row order: id, email, name, first_name, last_name, company_name, address, phone, enable_google_login, picture, role, created_at, updated_at, last_login
 */
function mapRowToUser(row) {
    if (!row || row.length === 0) return null;
    
    // Determine schema version based on row length
    const rowLength = row.length;
    
    // New schema (14 columns)
    if (rowLength >= 14) {
        return {
            id: row[0],
            email: row[1],
            name: row[2] || null,
            firstName: row[3] || null,
            lastName: row[4] || null,
            companyName: row[5] || null,
            address: row[6] || null,
            phone: row[7] || null,
            enableGoogleLogin: row[8] !== undefined && row[8] !== null ? (row[8] === true || row[8] === 'true' || row[8] === 1) : null,
            picture: row[9] || null,
            role: row[10] || 'USER',
            createdAt: row[11] || null,
            updatedAt: row[12] || null,
            lastLogin: row[13] || null
        };
    }
    // Old schema (8 columns: id, email, name, picture, role, created_at, updated_at, last_login)
    else if (rowLength >= 8) {
        return {
            id: row[0],
            email: row[1],
            name: row[2] || null,
            firstName: null,
            lastName: null,
            companyName: null,
            address: null,
            phone: null,
            enableGoogleLogin: null,
            picture: row[3] || null,
            role: row[4] || 'USER',
            createdAt: row[5] || null,
            updatedAt: row[6] || null,
            lastLogin: row[7] || null
        };
    }
    // Very old schema (7 columns: id, email, name, picture, role, created_at, updated_at)
    else {
        return {
            id: row[0],
            email: row[1],
            name: row[2] || null,
            firstName: null,
            lastName: null,
            companyName: null,
            address: null,
            phone: null,
            enableGoogleLogin: null,
            picture: row[3] || null,
            role: row[4] || 'USER',
            createdAt: row[5] || null,
            updatedAt: row[6] || null,
            lastLogin: null
        };
    }
}

/**
 * Get server helper functions (lazy-loaded to avoid circular dependency)
 */
function getServerHelpers() {
    // Use lib/snowflake instead of server
    const snowflake = require('../snowflake');
    return {
        executeSnowflakeSQL: snowflake.executeSnowflakeSQL,
        getTableName: snowflake.getTableName
    };
}

/**
 * Find or create a user by email
 * If user exists, return it. If not, create a new user with role "USER"
 */
async function findOrCreateUser(email, name, picture) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const escapedEmail = escapeSQLString(email);
    const escapedName = escapeSQLString(name || '');
    const escapedPicture = escapeSQLString(picture || '');

    const tableName = getTableName('users');

    // First, try to find existing user
    // Use explicit column order to ensure correct mapping
    const findSQL = `
        SELECT 
            id, email, name, 
            COALESCE(first_name, '') as first_name,
            COALESCE(last_name, '') as last_name,
            COALESCE(company_name, '') as company_name,
            COALESCE(address, '') as address,
            COALESCE(phone, '') as phone,
            COALESCE(enable_google_login, FALSE) as enable_google_login,
            picture, role, created_at, updated_at, last_login
        FROM ${tableName} 
        WHERE email = '${escapedEmail}'
    `;
    
    try {
        const result = await executeSnowflakeSQL(findSQL);
        
        if (result.data && result.data.length > 0) {
            // User exists, update last_login and return it
            const row = result.data[0];
            const userId = row[0];
            
            // Update last_login timestamp
            try {
                const updateLastLoginSQL = `
                    UPDATE ${tableName}
                    SET last_login = CURRENT_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP()
                    WHERE id = '${userId}'
                `;
                await executeSnowflakeSQL(updateLastLoginSQL);
            } catch (updateErr) {
                // If last_login column doesn't exist yet, that's okay - migration will add it
                console.log('[findOrCreateUser] Could not update last_login (column may not exist yet)');
            }
            
            return {
                id: row[0],
                email: row[1],
                name: row[2] || null,
                firstName: row[3] || null,
                lastName: row[4] || null,
                companyName: row[5] || null,
                address: row[6] || null,
                phone: row[7] || null,
                enableGoogleLogin: row[8] !== undefined && row[8] !== null ? (row[8] === true || row[8] === 'true' || row[8] === 1) : null,
                picture: row[9] || null,
                role: row[10] || 'USER',
                createdAt: row[11] || null,
                updatedAt: row[12] || null,
                lastLogin: row[13] || null
            };
        }

        // User doesn't exist, create new one
        const userId = uuidv4();
        const createSQL = `
            INSERT INTO ${tableName} (id, email, name, picture, role, created_at, updated_at, last_login)
            VALUES (
                '${userId}',
                '${escapedEmail}',
                '${escapedName}',
                '${escapedPicture}',
                'USER',
                CURRENT_TIMESTAMP(),
                CURRENT_TIMESTAMP(),
                CURRENT_TIMESTAMP()
            )
        `;

        try {
            await executeSnowflakeSQL(createSQL);
        } catch (createErr) {
            // If last_login column doesn't exist, try without it
            if (createErr.message && createErr.message.includes('last_login')) {
                const createSQLWithoutLastLogin = `
                    INSERT INTO ${tableName} (id, email, name, picture, role, created_at, updated_at)
                    VALUES (
                        '${userId}',
                        '${escapedEmail}',
                        '${escapedName}',
                        '${escapedPicture}',
                        'USER',
                        CURRENT_TIMESTAMP(),
                        CURRENT_TIMESTAMP()
                    )
                `;
                await executeSnowflakeSQL(createSQLWithoutLastLogin);
            } else {
                throw createErr;
            }
        }

        // Return the newly created user
        return {
            id: userId,
            email: email,
            name: name || '',
            picture: picture || '',
            role: 'USER',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };
    } catch (err) {
        console.error('[findOrCreateUser] Error:', err.message);
        throw err;
    }
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const escapedUserId = escapeSQLString(userId);
    const tableName = getTableName('users');
    // Use explicit column order to ensure correct mapping
    const sql = `
        SELECT 
            id, email, name, 
            COALESCE(first_name, '') as first_name,
            COALESCE(last_name, '') as last_name,
            COALESCE(company_name, '') as company_name,
            COALESCE(address, '') as address,
            COALESCE(phone, '') as phone,
            COALESCE(enable_google_login, FALSE) as enable_google_login,
            picture, role, created_at, updated_at, last_login
        FROM ${tableName} 
        WHERE id = '${escapedUserId}'
    `;

    try {
        const result = await executeSnowflakeSQL(sql);
        if (result.data && result.data.length > 0) {
            const row = result.data[0];
            return {
                id: row[0],
                email: row[1],
                name: row[2] || null,
                firstName: row[3] || null,
                lastName: row[4] || null,
                companyName: row[5] || null,
                address: row[6] || null,
                phone: row[7] || null,
                enableGoogleLogin: row[8] !== undefined && row[8] !== null ? (row[8] === true || row[8] === 'true' || row[8] === 1) : null,
                picture: row[9] || null,
                role: row[10] || 'USER',
                createdAt: row[11] || null,
                updatedAt: row[12] || null,
                lastLogin: row[13] || null
            };
        }
        return null;
    } catch (err) {
        console.error('[getUserById] Error:', err.message);
        return null;
    }
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const escapedEmail = escapeSQLString(email);
    const tableName = getTableName('users');
    // Use explicit column order to ensure correct mapping
    const sql = `
        SELECT 
            id, email, name, 
            COALESCE(first_name, '') as first_name,
            COALESCE(last_name, '') as last_name,
            COALESCE(company_name, '') as company_name,
            COALESCE(address, '') as address,
            COALESCE(phone, '') as phone,
            COALESCE(enable_google_login, FALSE) as enable_google_login,
            picture, role, created_at, updated_at, last_login
        FROM ${tableName} 
        WHERE email = '${escapedEmail}'
    `;

    try {
        const result = await executeSnowflakeSQL(sql);
        if (result.data && result.data.length > 0) {
            const row = result.data[0];
            return {
                id: row[0],
                email: row[1],
                name: row[2] || null,
                firstName: row[3] || null,
                lastName: row[4] || null,
                companyName: row[5] || null,
                address: row[6] || null,
                phone: row[7] || null,
                enableGoogleLogin: row[8] !== undefined && row[8] !== null ? (row[8] === true || row[8] === 'true' || row[8] === 1) : null,
                picture: row[9] || null,
                role: row[10] || 'USER',
                createdAt: row[11] || null,
                updatedAt: row[12] || null,
                lastLogin: row[13] || null
            };
        }
        return null;
    } catch (err) {
        console.error('[getUserByEmail] Error:', err.message);
        return null;
    }
}

/**
 * Get all users (admin only)
 */
async function getAllUsers(limit = 100, offset = 0) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const tableName = getTableName('users');
    // Use explicit column order to ensure correct mapping
    const sql = `
        SELECT 
            id, email, name, 
            COALESCE(first_name, '') as first_name,
            COALESCE(last_name, '') as last_name,
            COALESCE(company_name, '') as company_name,
            COALESCE(address, '') as address,
            COALESCE(phone, '') as phone,
            COALESCE(enable_google_login, FALSE) as enable_google_login,
            picture, role, created_at, updated_at, last_login
        FROM ${tableName}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;

    try {
        const result = await executeSnowflakeSQL(sql);
        if (result.data && result.data.length > 0) {
            return result.data.map(row => ({
                id: row[0],
                email: row[1],
                name: row[2] || null,
                firstName: row[3] || null,
                lastName: row[4] || null,
                companyName: row[5] || null,
                address: row[6] || null,
                phone: row[7] || null,
                enableGoogleLogin: row[8] !== undefined && row[8] !== null ? (row[8] === true || row[8] === 'true' || row[8] === 1) : null,
                picture: row[9] || null,
                role: row[10] || 'USER',
                createdAt: row[11] || null,
                updatedAt: row[12] || null,
                lastLogin: row[13] || null
            }));
        }
        return [];
    } catch (err) {
        console.error('[getAllUsers] Error:', err.message);
        return [];
    }
}

/**
 * Update user (admin only)
 * Supports: name, firstName, lastName, companyName, address, phone, enableGoogleLogin, picture, role
 */
async function updateUser(userId, updates) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const escapedUserId = escapeSQLString(userId);
    const tableName = getTableName('users');
    
    // Fetch current user once if we need firstName/lastName for name reconstruction
    let currentUser = null;
    if ((updates.firstName !== undefined && updates.lastName === undefined) || 
        (updates.lastName !== undefined && updates.firstName === undefined)) {
        currentUser = await getUserById(userId);
        if (!currentUser) {
            throw new Error('User not found');
        }
    }
    
    const updateFields = [];
    
    if (updates.name !== undefined) {
        updateFields.push(`name = '${escapeSQLString(updates.name)}'`);
    }
    if (updates.firstName !== undefined) {
        updateFields.push(`first_name = '${escapeSQLString(updates.firstName)}'`);
        // Update name if firstName changes
        if (updates.lastName !== undefined) {
            // Both firstName and lastName are being updated
            const fullName = `${updates.firstName} ${updates.lastName}`;
            updateFields.push(`name = '${escapeSQLString(fullName)}'`);
        } else if (currentUser && currentUser.lastName) {
            // Only firstName is being updated, use current lastName
            const fullName = `${updates.firstName} ${currentUser.lastName}`;
            updateFields.push(`name = '${escapeSQLString(fullName)}'`);
        }
    }
    if (updates.lastName !== undefined) {
        updateFields.push(`last_name = '${escapeSQLString(updates.lastName)}'`);
        // Update name if lastName changes but firstName wasn't in updates
        if (updates.firstName === undefined && currentUser && currentUser.firstName) {
            // Only lastName is being updated, use current firstName
            const fullName = `${currentUser.firstName} ${updates.lastName}`;
            updateFields.push(`name = '${escapeSQLString(fullName)}'`);
        }
    }
    if (updates.companyName !== undefined) {
        updateFields.push(`company_name = '${escapeSQLString(updates.companyName)}'`);
    }
    if (updates.address !== undefined) {
        if (updates.address === null || updates.address === '') {
            updateFields.push(`address = NULL`);
        } else {
            updateFields.push(`address = '${escapeSQLString(updates.address)}'`);
        }
    }
    if (updates.phone !== undefined) {
        updateFields.push(`phone = '${escapeSQLString(updates.phone)}'`);
    }
    if (updates.enableGoogleLogin !== undefined) {
        const enableGoogleLogin = updates.enableGoogleLogin === true || updates.enableGoogleLogin === 'true' || updates.enableGoogleLogin === 1;
        updateFields.push(`enable_google_login = ${enableGoogleLogin}`);
    }
    if (updates.picture !== undefined) {
        updateFields.push(`picture = '${escapeSQLString(updates.picture)}'`);
    }
    if (updates.role !== undefined) {
        // Validate role
        if (updates.role !== 'ADMIN' && updates.role !== 'USER') {
            throw new Error('Invalid role. Must be "ADMIN" or "USER"');
        }
        updateFields.push(`role = '${escapeSQLString(updates.role)}'`);
    }

    if (updateFields.length === 0) {
        throw new Error('No fields to update');
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP()');

    const sql = `
        UPDATE ${tableName}
        SET ${updateFields.join(', ')}
        WHERE id = '${escapedUserId}'
    `;

    try {
        await executeSnowflakeSQL(sql);
        return await getUserById(userId);
    } catch (err) {
        console.error('[updateUser] Error:', err.message);
        throw err;
    }
}

/**
 * Delete user (admin only)
 */
async function deleteUser(userId) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const escapedUserId = escapeSQLString(userId);
    const tableName = getTableName('users');
    
    // First check if user exists
    const user = await getUserById(userId);
    if (!user) {
        throw new Error('User not found');
    }

    const sql = `DELETE FROM ${tableName} WHERE id = '${escapedUserId}'`;

    try {
        await executeSnowflakeSQL(sql);
        return true;
    } catch (err) {
        console.error('[deleteUser] Error:', err.message);
        throw err;
    }
}

/**
 * Create a new user (admin only)
 * Fields: firstName, lastName, email, companyName, address (optional), phone, enableGoogleLogin, role (optional, defaults to 'USER')
 */
async function createUser(userData) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const tableName = getTableName('users');
    
    // Validate required fields
    if (!userData.firstName || !userData.firstName.trim()) {
        throw new Error('First name is required');
    }
    if (!userData.lastName || !userData.lastName.trim()) {
        throw new Error('Last name is required');
    }
    if (!userData.email || !userData.email.trim()) {
        throw new Error('Email is required');
    }
    if (!userData.companyName || !userData.companyName.trim()) {
        throw new Error('Company name is required');
    }
    if (!userData.phone || !userData.phone.trim()) {
        throw new Error('Phone is required');
    }
    if (userData.enableGoogleLogin === undefined || userData.enableGoogleLogin === null) {
        throw new Error('Enable Google login is required (true or false)');
    }

    // Validate role if provided
    const userRole = userData.role || 'USER'; // Default to 'USER' if not provided
    if (userRole !== 'ADMIN' && userRole !== 'USER') {
        throw new Error('Invalid role. Must be "ADMIN" or "USER"');
    }

    // Check if email already exists
    const escapedEmail = escapeSQLString(userData.email.trim());
    const checkEmailSQL = `SELECT id FROM ${tableName} WHERE email = '${escapedEmail}'`;
    
    try {
        const existingUser = await executeSnowflakeSQL(checkEmailSQL);
        if (existingUser.data && existingUser.data.length > 0) {
            throw new Error('User with this email already exists');
        }
    } catch (err) {
        if (err.message.includes('already exists')) {
            throw err;
        }
        // Other errors are okay, continue
    }

    // Create new user
    const userId = uuidv4();
    const escapedFirstName = escapeSQLString(userData.firstName.trim());
    const escapedLastName = escapeSQLString(userData.lastName.trim());
    const escapedCompanyName = escapeSQLString(userData.companyName.trim());
    const escapedAddress = userData.address ? escapeSQLString(userData.address.trim()) : null;
    const escapedPhone = escapeSQLString(userData.phone.trim());
    const enableGoogleLogin = userData.enableGoogleLogin === true || userData.enableGoogleLogin === 'true';
    const fullName = `${escapedFirstName} ${escapedLastName}`;

    // Build INSERT statement with optional address
    const escapedRole = escapeSQLString(userRole);
    let insertSQL;
    if (escapedAddress) {
        insertSQL = `
            INSERT INTO ${tableName} (
                id, email, name, first_name, last_name, company_name, 
                address, phone, enable_google_login, role, 
                created_at, updated_at
            )
            VALUES (
                '${userId}',
                '${escapedEmail}',
                '${escapeSQLString(fullName)}',
                '${escapedFirstName}',
                '${escapedLastName}',
                '${escapedCompanyName}',
                '${escapedAddress}',
                '${escapedPhone}',
                ${enableGoogleLogin},
                '${escapedRole}',
                CURRENT_TIMESTAMP(),
                CURRENT_TIMESTAMP()
            )
        `;
    } else {
        insertSQL = `
            INSERT INTO ${tableName} (
                id, email, name, first_name, last_name, company_name, 
                phone, enable_google_login, role, 
                created_at, updated_at
            )
            VALUES (
                '${userId}',
                '${escapedEmail}',
                '${escapeSQLString(fullName)}',
                '${escapedFirstName}',
                '${escapedLastName}',
                '${escapedCompanyName}',
                '${escapedPhone}',
                ${enableGoogleLogin},
                '${escapedRole}',
                CURRENT_TIMESTAMP(),
                CURRENT_TIMESTAMP()
            )
        `;
    }

    try {
        await executeSnowflakeSQL(insertSQL);
    } catch (createErr) {
        // If some columns don't exist, try with minimal columns first
        if (createErr.message && (createErr.message.includes('first_name') || createErr.message.includes('last_name') || createErr.message.includes('company_name') || createErr.message.includes('phone') || createErr.message.includes('enable_google_login'))) {
            // Fallback to basic user creation (for backward compatibility during migration)
            const basicInsertSQL = `
                INSERT INTO ${tableName} (id, email, name, role, created_at, updated_at)
                VALUES (
                    '${userId}',
                    '${escapedEmail}',
                    '${escapeSQLString(fullName)}',
                    '${escapedRole}',
                    CURRENT_TIMESTAMP(),
                    CURRENT_TIMESTAMP()
                )
            `;
            await executeSnowflakeSQL(basicInsertSQL);
            console.log('[createUser] Created user with basic fields (new columns may not exist yet)');
        } else {
            throw createErr;
        }
    }

    // Return the created user
    return await getUserById(userId);
}

module.exports = {
    findOrCreateUser,
    getUserById,
    getUserByEmail,
    getAllUsers,
    updateUser,
    createUser,
    deleteUser
};
