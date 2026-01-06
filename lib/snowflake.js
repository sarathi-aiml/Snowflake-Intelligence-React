const axios = require('axios');
const snowflake = require('snowflake-sdk');
const { AVAILABLE_AGENTS, getAgentConfig } = require('./agents');

// Legacy single agent support (for backward compatibility)
const SF_ACCOUNT_URL = process.env.SF_ACCOUNT_URL;
const SF_DB = process.env.SF_DB;
const SF_SCHEMA = process.env.SF_SCHEMA;
const SF_AGENT = process.env.SF_AGENT;
const SF_BEARER_TOKEN = process.env.SF_BEARER_TOKEN;
const SF_WAREHOUSE = process.env.SF_WAREHOUSE;

// Snowflake username/password authentication
const SNOWFLAKE_ACCOUNT = process.env.SNOWFLAKE_ACCOUNT;
const SNOWFLAKE_USERNAME = process.env.SNOWFLAKE_USERNAME;
const SNOWFLAKE_PASSWORD = process.env.SNOWFLAKE_PASSWORD;
const SNOWFLAKE_WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE;
const DB_SNOWFLAKE_SCHEMA = process.env.DB_SNOWFLAKE_SCHEMA;
const SNOWFLAKE_DB = process.env.SNOWFLAKE_DB;
const USE_MOCK = String(process.env.MOCK_MODE).toLowerCase() === 'true';

// Cache for session token from username/password auth
let snowflakeSessionToken = null;
let snowflakeTokenExpiry = null;

// Snowflake SDK connection cache
let snowflakeConnection = null;
let snowflakeConnectionPromise = null;

function getSnowflakeConnection() {
    if (!SNOWFLAKE_ACCOUNT || !SNOWFLAKE_USERNAME || !SNOWFLAKE_PASSWORD) {
        throw new Error('Snowflake credentials not configured');
    }

    // If connection exists and promise is active, return it
    if (snowflakeConnectionPromise) {
        return snowflakeConnectionPromise;
    }

    // Create new connection
    snowflakeConnectionPromise = new Promise((resolve, reject) => {
        // Extract account identifier from URL if needed (SDK expects just the identifier)
        let accountIdentifier = SNOWFLAKE_ACCOUNT;
        if (accountIdentifier.includes('.snowflakecomputing.com')) {
            // Extract account from URL like "https://xy12345.snowflakecomputing.com" -> "xy12345"
            accountIdentifier = accountIdentifier.replace(/https?:\/\//, '').replace('.snowflakecomputing.com', '').toUpperCase();
        } else {
            // Ensure uppercase for account identifier
            accountIdentifier = accountIdentifier.toUpperCase();
        }

        if (!SNOWFLAKE_DB || !DB_SNOWFLAKE_SCHEMA) {
            throw new Error('SNOWFLAKE_DB and DB_SNOWFLAKE_SCHEMA environment variables are required');
        }

        const connection = snowflake.createConnection({
            account: accountIdentifier,
            username: SNOWFLAKE_USERNAME,
            password: SNOWFLAKE_PASSWORD,
            warehouse: SNOWFLAKE_WAREHOUSE,
            database: SNOWFLAKE_DB,
            schema: DB_SNOWFLAKE_SCHEMA
        });

        connection.connect((err, conn) => {
            if (err) {
                console.error('[Snowflake SDK] Connection error:', err.message);
                snowflakeConnectionPromise = null;
                snowflakeConnection = null;
                reject(err);
                return;
            }
            snowflakeConnection = conn;
            console.log('[Snowflake SDK] Connection established');
            resolve(conn);

            // Clear promise after successful connection
            snowflakeConnectionPromise = null;
        });
    });

    return snowflakeConnectionPromise;
}

// Execute SQL using Snowflake SDK
function executeSQLWithSDK(sql) {
    return new Promise(async (resolve, reject) => {
        try {
            // Reset connection if there was an error before
            if (!snowflakeConnection) {
                snowflakeConnectionPromise = null;
            }

            console.log('[executeSQLWithSDK] Getting Snowflake connection...');
            const connection = await getSnowflakeConnection();
            console.log('[executeSQLWithSDK] Connection obtained, executing SQL...');

            connection.execute({
                sqlText: sql,
                complete: (err, stmt, rows) => {
                    if (err) {
                        console.error('[executeSQLWithSDK] SQL execution error:', err.message);
                        console.error('[executeSQLWithSDK] Error code:', err.code);
                        console.error('[executeSQLWithSDK] SQL state:', err.sqlState);
                        
                        // Reset connection on error (might be connection issue)
                        snowflakeConnection = null;
                        snowflakeConnectionPromise = null;

                        const error = new Error(err.message);
                        error.code = err.code;
                        error.sqlState = err.sqlState;
                        error.response = {
                            status: err.code || 500,
                            data: {
                                message: err.message,
                                code: err.code,
                                sqlState: err.sqlState
                            }
                        };
                        reject(error);
                        return;
                    }

                    console.log('[executeSQLWithSDK] SQL executed successfully, processing results...');

                    // SDK returns rows as array of objects, convert to array of arrays (REST API format)
                    let rowArray = [];

                    if (rows && rows.length > 0 && stmt) {
                        const columns = stmt.getColumns();
                        if (columns && columns.length > 0) {
                            rowArray = rows.map(row => {
                                // Convert object row to array format
                                return columns.map(col => {
                                    const colName = col.getName();
                                    return row[colName] !== undefined ? row[colName] : null;
                                });
                            });
                        } else {
                            // Fallback: if columns not available, use rows as-is
                            rowArray = rows;
                        }
                    }

                    const result = {
                        data: rowArray,
                        statementHandle: stmt?.getStatementId(),
                        success: true
                    };

                    console.log('[executeSQLWithSDK] Result processed, returning', rowArray.length, 'rows');
                    resolve(result);
                }
            });
        } catch (err) {
            console.error('[executeSQLWithSDK] Connection or execution error:', err.message);
            // Reset connection on error
            snowflakeConnection = null;
            snowflakeConnectionPromise = null;
            reject(err);
        }
    });
}

// Authenticate with Snowflake using username/password and get session token
async function authenticateSnowflake() {
    // Check if we have a valid cached token
    if (snowflakeSessionToken && snowflakeTokenExpiry && Date.now() < snowflakeTokenExpiry) {
        return snowflakeSessionToken;
    }

    if (!SNOWFLAKE_ACCOUNT || !SNOWFLAKE_USERNAME || !SNOWFLAKE_PASSWORD) {
        throw new Error('Snowflake username/password credentials not configured');
    }

    // Validate that credentials are not empty strings
    if (typeof SNOWFLAKE_ACCOUNT === 'string' && !SNOWFLAKE_ACCOUNT.trim()) {
        throw new Error('SNOWFLAKE_ACCOUNT cannot be empty');
    }
    if (typeof SNOWFLAKE_USERNAME === 'string' && !SNOWFLAKE_USERNAME.trim()) {
        throw new Error('SNOWFLAKE_USERNAME cannot be empty');
    }
    if (typeof SNOWFLAKE_PASSWORD === 'string' && !SNOWFLAKE_PASSWORD.trim()) {
        throw new Error('SNOWFLAKE_PASSWORD cannot be empty');
    }

    try {
        // Construct account URL from account identifier
        // Format: https://<account>.snowflakecomputing.com
        // Handle different account identifier formats
        let accountUrl;
        if (SNOWFLAKE_ACCOUNT.includes('.snowflakecomputing.com')) {
            accountUrl = SNOWFLAKE_ACCOUNT;
        } else {
            // Convert account identifier to URL format (lowercase, preserve hyphens)
            const accountLower = SNOWFLAKE_ACCOUNT.toLowerCase();
            accountUrl = `https://${accountLower}.snowflakecomputing.com`;
        }

        // Build login URL with parameters
        const loginParams = new URLSearchParams();
        if (SNOWFLAKE_WAREHOUSE) loginParams.append('warehouse', SNOWFLAKE_WAREHOUSE);
        if (SNOWFLAKE_DB) loginParams.append('databaseName', SNOWFLAKE_DB);
        if (DB_SNOWFLAKE_SCHEMA) loginParams.append('schemaName', DB_SNOWFLAKE_SCHEMA);

        const loginUrl = `${accountUrl}/session/v1/login-request?${loginParams.toString()}`;

        // Snowflake REST API session login expects specific format
        // Based on Snowflake documentation, the payload should be a JSON object with data property
        // containing the login credentials (account is in the URL, not the payload)
        const loginData = {
            data: {
                LOGIN_NAME: SNOWFLAKE_USERNAME,
                PASSWORD: SNOWFLAKE_PASSWORD
            }
        };

        console.log('[Auth] Authenticating with Snowflake using username/password...');
        console.log('[Auth] Login URL:', loginUrl);
        console.log('[Auth] Using Snowflake REST API format with data wrapper...');
        console.log('[Auth] Login payload (without password):', JSON.stringify({
            data: {
                LOGIN_NAME: loginData.data.LOGIN_NAME,
                PASSWORD: '***'
            }
        }));
        
        const response = await axios.post(loginUrl, loginData, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Snowflake-NodeJS-Client'
            },
            validateStatus: () => true
        });

        console.log('[Auth] Response status:', response.status);
        console.log('[Auth] Response data keys:', Object.keys(response.data || {}));
        console.log('[Auth] Response data (first 500 chars):', JSON.stringify(response.data).substring(0, 500));
        
        if (response.status !== 200) {
            const errorMsg = response.data?.message || response.data?.error || JSON.stringify(response.data) || 'Unknown error';
            console.error('[Auth] Authentication failed. Response:', JSON.stringify(response.data, null, 2));
            throw new Error(`Snowflake authentication failed (${response.status}): ${errorMsg}`);
        }

        // Check for error indicators even with 200 status
        if (response.data?.success === false || response.data?.error) {
            const errorMsg = response.data?.message || response.data?.error || 'Authentication failed';
            console.error('[Auth] Authentication error in response:', JSON.stringify(response.data, null, 2));
            throw new Error(`Snowflake authentication failed: ${errorMsg}`);
        }

        // Snowflake session login returns: { data: { masterToken: "...", token: "..." } }
        // The 'token' field is the session token we need for REST API calls
        // The 'masterToken' is for key pair authentication
        let token = null;
        
        if (response.data?.data?.token) {
            token = response.data.data.token;
            console.log('[Auth] Using session token from response.data.data.token');
        } else if (response.data?.token) {
            token = response.data.token;
            console.log('[Auth] Using session token from response.data.token');
        } else if (response.data?.data?.masterToken) {
            // Fallback: try masterToken if token not available (might work for some endpoints)
            token = response.data.data.masterToken;
            console.log('[Auth] Warning: Using masterToken as fallback (may not work for all endpoints)');
        } else {
            console.error('[Auth] No token found in response. Full response:', JSON.stringify(response.data, null, 2));
            console.error('[Auth] Response headers:', JSON.stringify(response.headers, null, 2));
            throw new Error('No token received from Snowflake authentication. Please check your Snowflake credentials and account configuration.');
        }
        
        console.log('[Auth] Token extracted successfully (first 50 chars):', token.substring(0, 50) + '...');
        console.log('[Auth] Token type:', token.startsWith('ver:') ? 'Snowflake session token' : 'Unknown format');

        // Cache token for 4 hours (Snowflake sessions typically last 4 hours)
        snowflakeSessionToken = token;
        snowflakeTokenExpiry = Date.now() + (4 * 60 * 60 * 1000);

        console.log('[Auth] Successfully authenticated with Snowflake');
        return token;
    } catch (err) {
        console.error('[Auth] Snowflake authentication error:', err.message);
        throw err;
    }
}

function getSnowflakeToken() {
    // For a real app you should implement OAuth or key pair auth here.
    // For this demo we assume you already have a bearer token in env.
    return SF_BEARER_TOKEN;
}

// Helper function to get fully qualified table name
// Uses the database from config (required, no defaults)
function getTableName(tableName) {
    // Priority: SNOWFLAKE_DB > agent config > legacy SF_DB
    const agentConfig = AVAILABLE_AGENTS.find(a => a.warehouse) || AVAILABLE_AGENTS[0] || null;
    const db = SNOWFLAKE_DB || agentConfig?.db || SF_DB;
    const schema = DB_SNOWFLAKE_SCHEMA || agentConfig?.schema || SF_SCHEMA;
    
    if (!db || !schema) {
        throw new Error('Database and schema must be configured via SNOWFLAKE_DB and DB_SNOWFLAKE_SCHEMA environment variables');
    }
    
    // Convert table name to uppercase for Snowflake (CONVERSATIONS, USERS, etc.)
    const tableNameUpper = tableName.toUpperCase();
    return `${db}.${schema}.${tableNameUpper}`;
}

async function executeSnowflakeSQL(sql, agentId = null) {
    // Check if username/password authentication is configured (priority)
    // Make sure all three are truthy and non-empty strings
    const useUsernamePassword = !!(SNOWFLAKE_ACCOUNT && SNOWFLAKE_USERNAME && SNOWFLAKE_PASSWORD) &&
                                 typeof SNOWFLAKE_ACCOUNT === 'string' && SNOWFLAKE_ACCOUNT.trim().length > 0 &&
                                 typeof SNOWFLAKE_USERNAME === 'string' && SNOWFLAKE_USERNAME.trim().length > 0 &&
                                 typeof SNOWFLAKE_PASSWORD === 'string' && SNOWFLAKE_PASSWORD.trim().length > 0;
    
    // Debug: Log actual values (masked for security)
    console.log('[executeSnowflakeSQL] Auth method check:', {
        useUsernamePassword: !!useUsernamePassword, // Ensure boolean
        hasAccount: !!SNOWFLAKE_ACCOUNT,
        accountValue: SNOWFLAKE_ACCOUNT ? `${SNOWFLAKE_ACCOUNT.substring(0, 3)}...` : 'NOT SET',
        hasUsername: !!SNOWFLAKE_USERNAME,
        usernameValue: SNOWFLAKE_USERNAME ? `${SNOWFLAKE_USERNAME.substring(0, 3)}...` : 'NOT SET',
        hasPassword: !!SNOWFLAKE_PASSWORD,
        passwordValue: SNOWFLAKE_PASSWORD ? '***SET***' : 'NOT SET',
        hasWarehouse: !!SNOWFLAKE_WAREHOUSE,
        warehouseValue: SNOWFLAKE_WAREHOUSE || 'NOT SET',
        hasBearerToken: !!SF_BEARER_TOKEN,
        bearerTokenValue: SF_BEARER_TOKEN ? '***SET***' : 'NOT SET'
    });

    // Use Snowflake SDK if username/password is available (more reliable)
    // Convert useUsernamePassword to boolean to ensure correct evaluation
    const shouldUseUsernamePassword = Boolean(useUsernamePassword);
    
    console.log('[executeSnowflakeSQL] Will use SDK?', shouldUseUsernamePassword && !!SNOWFLAKE_WAREHOUSE);
    
    // When username/password is configured, ALWAYS use SDK - don't fall back to REST API
    // REST API with username/password has token issues, SDK is more reliable
    if (shouldUseUsernamePassword && SNOWFLAKE_WAREHOUSE) {
        try {
            if (!SNOWFLAKE_DB || !DB_SNOWFLAKE_SCHEMA) {
                throw new Error('SNOWFLAKE_DB and DB_SNOWFLAKE_SCHEMA environment variables are required');
            }
            
            console.log('[executeSnowflakeSQL] Using Snowflake SDK for SQL execution');
            console.log('[executeSnowflakeSQL] Account:', SNOWFLAKE_ACCOUNT);
            console.log('[executeSnowflakeSQL] Warehouse:', SNOWFLAKE_WAREHOUSE);
            console.log('[executeSnowflakeSQL] Database:', SNOWFLAKE_DB);
            console.log('[executeSnowflakeSQL] Schema:', DB_SNOWFLAKE_SCHEMA);
            const result = await executeSQLWithSDK(sql);
            console.log('[executeSnowflakeSQL] SDK execution successful');
            return result;
        } catch (err) {
            console.error('[executeSnowflakeSQL] SDK execution error:', err.message);
            console.error('[executeSnowflakeSQL] SDK error code:', err.code);
            console.error('[executeSnowflakeSQL] SDK error SQL state:', err.sqlState);
            console.error('[executeSnowflakeSQL] SDK error details:', err.stack || err);
            
            // When username/password is configured, NEVER fall back to REST API
            // SDK should work - if it doesn't, the credentials are wrong or there's a connection issue
            console.error('[executeSnowflakeSQL] SDK failed with username/password credentials. Not falling back to REST API.');
            console.error('[executeSnowflakeSQL] Please check:');
            console.error('[executeSnowflakeSQL]   1. SNOWFLAKE_ACCOUNT is correct (account identifier, e.g., "xy12345")');
            console.error('[executeSnowflakeSQL]   2. SNOWFLAKE_USERNAME is correct');
            console.error('[executeSnowflakeSQL]   3. SNOWFLAKE_PASSWORD is correct');
            console.error('[executeSnowflakeSQL]   4. SNOWFLAKE_WAREHOUSE exists and is accessible');
            console.error('[executeSnowflakeSQL]   5. Network connectivity to Snowflake');
            throw err; // Always throw - don't fall back
        }
    } else {
        console.log('[executeSnowflakeSQL] SDK not available. Reason:', {
            useUsernamePassword: shouldUseUsernamePassword,
            hasWarehouse: !!SNOWFLAKE_WAREHOUSE
        });
        
        // If username/password is partially configured, throw error instead of using bearer token
        if (SNOWFLAKE_ACCOUNT || SNOWFLAKE_USERNAME || SNOWFLAKE_PASSWORD) {
            const missing = [];
            if (!SNOWFLAKE_ACCOUNT) missing.push('SNOWFLAKE_ACCOUNT');
            if (!SNOWFLAKE_USERNAME) missing.push('SNOWFLAKE_USERNAME');
            if (!SNOWFLAKE_PASSWORD) missing.push('SNOWFLAKE_PASSWORD');
            if (!SNOWFLAKE_WAREHOUSE) missing.push('SNOWFLAKE_WAREHOUSE');
            throw new Error(`Snowflake username/password authentication is partially configured. Missing: ${missing.join(', ')}. Please set all required environment variables: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD, and SNOWFLAKE_WAREHOUSE`);
        }
    }

    // Fall back to REST API (for SDK failures or when using bearer tokens)
    let token, accountUrl, db, schema, warehouse;

    // ALWAYS prefer username/password if ANY credentials are set (even partially)
    // This prevents accidentally using invalid bearer tokens
    const hasAnyUsernamePasswordCreds = !!(SNOWFLAKE_ACCOUNT || SNOWFLAKE_USERNAME || SNOWFLAKE_PASSWORD);
    
    console.log('[executeSnowflakeSQL] REST API path - useUsernamePassword:', shouldUseUsernamePassword, 'hasAnyCreds:', hasAnyUsernamePasswordCreds);
    
    if (shouldUseUsernamePassword) {
        // Use username/password authentication via REST API
        console.log('[executeSnowflakeSQL] Using username/password authentication via REST API');
        try {
            token = await authenticateSnowflake();
            console.log('[executeSnowflakeSQL] Successfully obtained session token from username/password auth');
        } catch (authErr) {
            console.error('[executeSnowflakeSQL] Failed to authenticate with username/password:', authErr.message);
            throw new Error(`Snowflake authentication failed: ${authErr.message}. Please verify your SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, and SNOWFLAKE_PASSWORD are correct.`);
        }
        // Construct account URL same way as authentication function
        if (SNOWFLAKE_ACCOUNT.includes('.snowflakecomputing.com')) {
            accountUrl = SNOWFLAKE_ACCOUNT;
        } else {
            const accountLower = SNOWFLAKE_ACCOUNT.toLowerCase();
            accountUrl = `https://${accountLower}.snowflakecomputing.com`;
        }
        
        if (!SNOWFLAKE_DB || !DB_SNOWFLAKE_SCHEMA) {
            throw new Error('SNOWFLAKE_DB and DB_SNOWFLAKE_SCHEMA environment variables are required');
        }
        
        db = SNOWFLAKE_DB;
        schema = DB_SNOWFLAKE_SCHEMA;
        warehouse = SNOWFLAKE_WAREHOUSE;

        if (!warehouse) {
            throw new Error('SNOWFLAKE_WAREHOUSE environment variable is required for username/password authentication');
        }
    } else if (hasAnyUsernamePasswordCreds) {
        // Username/password is partially configured - don't use bearer token
        const missing = [];
        if (!SNOWFLAKE_ACCOUNT) missing.push('SNOWFLAKE_ACCOUNT');
        if (!SNOWFLAKE_USERNAME) missing.push('SNOWFLAKE_USERNAME');
        if (!SNOWFLAKE_PASSWORD) missing.push('SNOWFLAKE_PASSWORD');
        if (!SNOWFLAKE_WAREHOUSE) missing.push('SNOWFLAKE_WAREHOUSE');
        
        console.error('[executeSnowflakeSQL] Username/password credentials partially configured. Missing:', missing);
        throw new Error(`Snowflake username/password authentication is partially configured. Missing: ${missing.join(', ')}. Please set all required environment variables: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD, and SNOWFLAKE_WAREHOUSE`);
    } else {
        // No username/password credentials at all - use bearer token (legacy)
        console.log('[executeSnowflakeSQL] No username/password credentials found, using bearer token authentication');
        
        let agentConfig = null;

        if (agentId) {
            agentConfig = getAgentConfig(agentId);
        } else {
            // Find first agent with warehouse configured for SQL operations
            agentConfig = AVAILABLE_AGENTS.find(a => a.warehouse) || AVAILABLE_AGENTS[0] || null;
        }

        // Use agent config if available, otherwise fall back to legacy environment variables
        token = agentConfig?.bearerToken || SF_BEARER_TOKEN || getSnowflakeToken();
        accountUrl = agentConfig?.accountUrl || SF_ACCOUNT_URL;
        db = agentConfig?.db || SF_DB;
        schema = agentConfig?.schema || SF_SCHEMA;
        warehouse = agentConfig?.warehouse || SF_WAREHOUSE;
        
        if (!token) {
            throw new Error('No Snowflake authentication method configured. Please set either: (1) SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD, and SNOWFLAKE_WAREHOUSE for username/password auth, OR (2) SF_BEARER_TOKEN for bearer token auth.');
        }
        
        if (!accountUrl || !db || !schema || !warehouse) {
            throw new Error(`Missing Snowflake configuration for bearer token authentication. Missing: ${[
                !accountUrl && 'accountUrl',
                !db && 'database',
                !schema && 'schema',
                !warehouse && 'warehouse'
            ].filter(Boolean).join(', ')}`);
        }
    }

    const normalizedUrl = normalizeUrl(accountUrl);

    // Provide detailed error message about what's missing
    if (!token || !normalizedUrl || !db || !schema || !warehouse) {
        const missing = [];
        if (!token) missing.push(useUsernamePassword ? 'authentication token' : 'bearerToken');
        if (!normalizedUrl) missing.push('accountUrl');
        if (!db) missing.push('database');
        if (!schema) missing.push('schema');
        if (!warehouse) missing.push('warehouse');

        const configSource = useUsernamePassword
            ? 'SNOWFLAKE_* environment variables'
            : (agentConfig ? `agent ${agentConfig.id}` : 'legacy SF_* variables');
        throw new Error(`Missing Snowflake configuration for SQL execution. Missing: ${missing.join(', ')}. Please configure these in your ${configSource}. Note: Warehouse is required for SQL operations (conversations storage).`);
    }

    const sqlUrl = `${normalizedUrl.replace(/\/$/, '')}/api/v2/statements`;
    
    // Store auth method for error messages
    const authMethod = useUsernamePassword ? 'username/password' : 'bearer token';

    try {
        const response = await axios.post(
            sqlUrl,
            {
                statement: sql,
                database: db,
                schema: schema,
                warehouse: warehouse
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                validateStatus: () => true // Don't throw on any status code
            }
        );

        if (response.status >= 400) {
            let errorMessage = `Snowflake SQL error (${response.status}): ${response.data?.message || 'Unknown error'}`;
            
            // Provide helpful error messages for common authentication errors
            if (response.status === 401) {
                if (response.data?.message?.includes('OAuth') || response.data?.message?.includes('token')) {
                    if (useUsernamePassword) {
                        errorMessage = `Authentication failed: ${response.data?.message || 'Invalid credentials'}. Please check your SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, and SNOWFLAKE_PASSWORD environment variables.`;
                    } else {
                        errorMessage = `Bearer token authentication failed: ${response.data?.message || 'Invalid or expired token'}. Please check your SF_BEARER_TOKEN environment variable, or switch to username/password authentication by setting SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD, and SNOWFLAKE_WAREHOUSE.`;
                    }
                } else {
                    errorMessage = `Authentication failed: ${response.data?.message || 'Invalid credentials'}`;
                }
            } else if (response.status === 422 && response.data?.message?.includes("suspended due to lack of payment method")) {
                errorMessage = "Account Issue: Your Snowflake account has been suspended due to payment method issues. Please update your payment method in your Snowflake account settings.";
            }
            
            console.error('[executeSnowflakeSQL] Snowflake API error:', {
                status: response.status,
                message: response.data?.message,
                code: response.data?.code,
                authMethod: authMethod,
                usingUsernamePassword: useUsernamePassword
            });
            
            throw new Error(errorMessage);
        }

        return response.data;
    } catch (err) {
        console.error('SQL execution error:', err.message);
        if (err.response) {
            console.error('Response status:', err.response.status);
            console.error('Response data:', err.response.data);

            // Provide user-friendly error messages
            const errorData = err.response.data;
            if (errorData && errorData.message) {
                if (errorData.message.includes('suspended') || errorData.message.includes('payment')) {
                    console.error('Account suspended - payment method required');
                } else if (errorData.code === '000666') {
                    console.error('Snowflake account issue - check account status');
                }
            }
        }
        // Don't throw - let the calling function handle it gracefully
        throw err;
    }
}

async function initializeProjectsTable() {
    // Get database name from config to create fully qualified schema/table names
    let db = null;
    let schema = null;
    try {
        // Priority: SNOWFLAKE_DB > agent config > legacy SF_DB
        const agentConfig = AVAILABLE_AGENTS.find(a => a.warehouse) || AVAILABLE_AGENTS[0] || null;
        db = SNOWFLAKE_DB || agentConfig?.db || SF_DB;
        schema = DB_SNOWFLAKE_SCHEMA || agentConfig?.schema || SF_SCHEMA;

        if (!db || !schema) {
            console.error('Cannot initialize tables: Database and schema must be configured via SNOWFLAKE_DB and DB_SNOWFLAKE_SCHEMA environment variables');
            return;
        }

        // First, create schema if it doesn't exist (using fully qualified name)
        const createSchemaSQL = `CREATE SCHEMA IF NOT EXISTS ${db}.${schema}`;

        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS ${db}.${schema}.projects (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(500) NOT NULL,
                description VARCHAR(2000),
                created_by VARCHAR(255),
                created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
                updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
            )
        `;

        console.log(`[Initialize] Creating schema: ${db}.${schema}`);
        await executeSnowflakeSQL(createSchemaSQL);
        console.log(`[Initialize] ✓ Schema ${db}.${schema} created/verified`);

        console.log(`[Initialize] Creating table: ${db}.${schema}.projects`);
        await executeSnowflakeSQL(createTableSQL);
        console.log(`[Initialize] ✓ Table ${db}.${schema}.projects created/verified`);
    } catch (err) {
        console.error('Failed to initialize projects table:', err.message);
        if (err.response && err.response.data) {
            const errorData = err.response.data;
            console.error('Error details:', JSON.stringify(errorData, null, 2));
        }
        // Don't throw - allow app to continue even if table creation fails
    }
}

async function initializeUsersTable() {
    // Get database name from config to create fully qualified schema/table names
    let db = null;
    let schema = null;
    try {
        // Priority: SNOWFLAKE_DB > agent config > legacy SF_DB
        const agentConfig = AVAILABLE_AGENTS.find(a => a.warehouse) || AVAILABLE_AGENTS[0] || null;
        db = SNOWFLAKE_DB || agentConfig?.db || SF_DB;
        schema = DB_SNOWFLAKE_SCHEMA || agentConfig?.schema || SF_SCHEMA;

        if (!db || !schema) {
            console.error('Cannot initialize tables: Database and schema must be configured via SNOWFLAKE_DB and DB_SNOWFLAKE_SCHEMA environment variables');
            return;
        }

        // First, create schema if it doesn't exist (using fully qualified name)
        const createSchemaSQL = `CREATE SCHEMA IF NOT EXISTS ${db}.${schema}`;

        const createTableSQL = `
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

        console.log(`[Initialize] Creating schema: ${db}.${schema}`);
        await executeSnowflakeSQL(createSchemaSQL);
        console.log(`[Initialize] ✓ Schema ${db}.${schema} created/verified`);

        console.log(`[Initialize] Creating table: ${db}.${schema}.users`);
        await executeSnowflakeSQL(createTableSQL);
        console.log(`[Initialize] ✓ Table ${db}.${schema}.users created/verified`);

        // Add new columns to existing table if they don't exist (migration)
        const newColumns = [
            { name: 'first_name', type: 'VARCHAR(255)' },
            { name: 'last_name', type: 'VARCHAR(255)' },
            { name: 'company_name', type: 'VARCHAR(500)' },
            { name: 'address', type: 'VARCHAR(1000)' },
            { name: 'phone', type: 'VARCHAR(50)' },
            { name: 'enable_google_login', type: 'BOOLEAN DEFAULT FALSE' },
            { name: 'last_login', type: 'TIMESTAMP_NTZ' }
        ];

        for (const column of newColumns) {
            try {
                const addColumnSQL = `
                    ALTER TABLE ${db}.${schema}.users 
                    ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
                `;
                await executeSnowflakeSQL(addColumnSQL);
                console.log(`[Initialize] ✓ ${column.name} column added/verified`);
            } catch (err) {
                // Column might already exist or table might not exist yet - that's okay
                console.log(`[Initialize] ${column.name} column check completed (may already exist)`);
            }
        }

        // Create index on email
        try {
            const alterUsersClusteringSQL = `ALTER TABLE ${db}.${schema}.users CLUSTER BY (email)`;
            await executeSnowflakeSQL(alterUsersClusteringSQL);
            console.log(`[Initialize] ✓ Clustering key on users.email created/verified`);
        } catch (err) {
            // Clustering may already be set or table may not support it - that's okay
            if (err.message && err.message.includes('not a hybrid table')) {
                console.log(`[Initialize] Skipping clustering (Snowflake uses automatic optimization for regular tables)`);
            } else {
                console.log(`[Initialize] Clustering key check completed (may already be set)`);
            }
        }
    } catch (err) {
        console.error('Failed to initialize users table:', err.message);
        if (err.response && err.response.data) {
            const errorData = err.response.data;
            console.error('Error details:', JSON.stringify(errorData, null, 2));
        }
        // Don't throw - allow app to continue even if table creation fails
    }
}

async function initializeConversationsTable() {
    // Get database name from config to create fully qualified schema/table names
    let db = null;
    let schema = null;
    try {
        // Priority: SNOWFLAKE_DB > agent config > legacy SF_DB
        const agentConfig = AVAILABLE_AGENTS.find(a => a.warehouse) || AVAILABLE_AGENTS[0] || null;
        db = SNOWFLAKE_DB || agentConfig?.db || SF_DB;
        schema = DB_SNOWFLAKE_SCHEMA || agentConfig?.schema || SF_SCHEMA;

        if (!db || !schema) {
            console.error('Cannot initialize tables: Database and schema must be configured via SNOWFLAKE_DB and DB_SNOWFLAKE_SCHEMA environment variables');
            return;
        }

        // First, create schema if it doesn't exist (using fully qualified name)
        const createSchemaSQL = `CREATE SCHEMA IF NOT EXISTS ${db}.${schema}`;

        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS ${db}.${schema}.conversations (
                conversation_id VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(255),
                project_id VARCHAR(255),
                session_id VARCHAR(255),
                title VARCHAR(500),
                messages VARIANT,
                created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
                updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
            )
        `;

        console.log(`[Initialize] Creating schema: ${db}.${schema}`);
        await executeSnowflakeSQL(createSchemaSQL);
        console.log(`[Initialize] ✓ Schema ${db}.${schema} created/verified`);

        console.log(`[Initialize] Creating table: ${db}.${schema}.conversations`);
        await executeSnowflakeSQL(createTableSQL);
        console.log(`[Initialize] ✓ Table ${db}.${schema}.conversations created/verified`);

        // Add user_id column to existing table if it doesn't exist (migration)
        try {
            const addUserIdColumnSQL = `
                ALTER TABLE ${db}.${schema}.conversations 
                ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)
            `;
            await executeSnowflakeSQL(addUserIdColumnSQL);
            console.log(`[Initialize] ✓ user_id column added/verified`);
        } catch (err) {
            // Column might already exist or table might not exist yet - that's okay
            console.log(`[Initialize] user_id column check completed (may already exist)`);
        }

        // Add project_id column to existing table if it doesn't exist (migration)
        try {
            const addProjectIdColumnSQL = `
                ALTER TABLE ${db}.${schema}.conversations 
                ADD COLUMN IF NOT EXISTS project_id VARCHAR(255)
            `;
            await executeSnowflakeSQL(addProjectIdColumnSQL);
            console.log(`[Initialize] ✓ project_id column added/verified`);
        } catch (err) {
            // Column might already exist or table might not exist yet - that's okay
            console.log(`[Initialize] project_id column check completed (may already exist)`);
        }

        // Create indexes
        try {
            const createUserIdIndexSQL = `CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON ${db}.${schema}.conversations (user_id)`;
            await executeSnowflakeSQL(createUserIdIndexSQL);
            console.log(`[Initialize] ✓ Index on conversations.user_id created/verified`);
        } catch (err) {
            // Index might already exist - that's okay
            console.log(`[Initialize] Index on conversations.user_id check completed (may already exist)`);
        }

        try {
            const createProjectIdIndexSQL = `CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON ${db}.${schema}.conversations (project_id)`;
            await executeSnowflakeSQL(createProjectIdIndexSQL);
            console.log(`[Initialize] ✓ Index on conversations.project_id created/verified`);
        } catch (err) {
            // Index might already exist - that's okay
            console.log(`[Initialize] Index on conversations.project_id check completed (may already exist)`);
        }

        // Add like and feedback columns to existing table if they don't exist (migration)
        try {
            const addLikeColumnSQL = `
                ALTER TABLE ${db}.${schema}.conversations 
                ADD COLUMN IF NOT EXISTS is_liked BOOLEAN DEFAULT FALSE
            `;
            await executeSnowflakeSQL(addLikeColumnSQL);
            console.log(`[Initialize] ✓ is_liked column added/verified`);
        } catch (err) {
            console.log(`[Initialize] is_liked column check completed (may already exist)`);
        }

        try {
            const addFeedbackColumnSQL = `
                ALTER TABLE ${db}.${schema}.conversations 
                ADD COLUMN IF NOT EXISTS feedback VARCHAR(2000)
            `;
            await executeSnowflakeSQL(addFeedbackColumnSQL);
            console.log(`[Initialize] ✓ feedback column added/verified`);
        } catch (err) {
            console.log(`[Initialize] feedback column check completed (may already exist)`);
        }

        try {
            const addFeedbackTimestampColumnSQL = `
                ALTER TABLE ${db}.${schema}.conversations 
                ADD COLUMN IF NOT EXISTS feedback_submitted_at TIMESTAMP_NTZ
            `;
            await executeSnowflakeSQL(addFeedbackTimestampColumnSQL);
            console.log(`[Initialize] ✓ feedback_submitted_at column added/verified`);
        } catch (err) {
            console.log(`[Initialize] feedback_submitted_at column check completed (may already exist)`);
        }
    } catch (err) {
        console.error('Failed to initialize conversations table:', err.message);
        if (err.response && err.response.data) {
            const errorData = err.response.data;
            console.error('Error details:', JSON.stringify(errorData, null, 2));
            if (errorData.message && (errorData.message.includes('suspended') || errorData.message.includes('payment'))) {
                console.warn('⚠️  Snowflake account suspended - conversations will not be persisted');
            } else if (errorData.code === '000666') {
                console.warn('⚠️  Snowflake account issue - conversations will not be persisted');
            }
        }
        // Don't throw - allow app to continue even if table creation fails
    }
}

async function initializeFilesTable() {
    // Get database name from config to create fully qualified schema/table names
    let db = null;
    let schema = null;
    try {
        // Priority: SNOWFLAKE_DB > agent config > legacy SF_DB
        const agentConfig = AVAILABLE_AGENTS.find(a => a.warehouse) || AVAILABLE_AGENTS[0] || null;
        db = SNOWFLAKE_DB || agentConfig?.db || SF_DB;
        schema = DB_SNOWFLAKE_SCHEMA || agentConfig?.schema || SF_SCHEMA;

        if (!db || !schema) {
            console.error('Cannot initialize files tables: Database and schema must be configured via SNOWFLAKE_DB and DB_SNOWFLAKE_SCHEMA environment variables');
            return;
        }

        // First, create schema if it doesn't exist (using fully qualified name)
        const createSchemaSQL = `CREATE SCHEMA IF NOT EXISTS ${db}.${schema}`;

        const createTableSQL = `
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

        const createChunksTableSQL = `
            CREATE TABLE IF NOT EXISTS ${db}.${schema}.uploaded_file_chunks (
                file_id VARCHAR(255),
                chunk_index INTEGER,
                chunk_content VARIANT,
                PRIMARY KEY (file_id, chunk_index)
            )
        `;

        console.log(`[Initialize] Creating schema: ${db}.${schema}`);
        await executeSnowflakeSQL(createSchemaSQL);
        console.log(`[Initialize] ✓ Schema ${db}.${schema} created/verified`);

        console.log(`[Initialize] Creating table: ${db}.${schema}.uploaded_files`);
        await executeSnowflakeSQL(createTableSQL);
        console.log(`[Initialize] ✓ Table ${db}.${schema}.uploaded_files created/verified`);

        // Migration: Try to add new columns to existing table
        // Snowflake doesn't support IF NOT EXISTS for ALTER TABLE, so we catch errors
        const addIsChunkedColumnSQL = `
            ALTER TABLE ${db}.${schema}.uploaded_files 
            ADD COLUMN is_chunked BOOLEAN DEFAULT FALSE
        `;

        const addChunkCountColumnSQL = `
            ALTER TABLE ${db}.${schema}.uploaded_files 
            ADD COLUMN chunk_count INTEGER DEFAULT 0
        `;

        // Try to add is_chunked column (will fail if column already exists - that's okay)
        try {
            await executeSnowflakeSQL(addIsChunkedColumnSQL);
            console.log('Added is_chunked column to existing table');
        } catch (err) {
            // Column already exists or table doesn't exist yet - that's okay
            if (err.message && err.message.includes('already exists')) {
                console.log('is_chunked column already exists');
            } else {
                console.log('is_chunked column check completed (may not exist yet)');
            }
        }

        // Try to add chunk_count column (will fail if column already exists - that's okay)
        try {
            await executeSnowflakeSQL(addChunkCountColumnSQL);
            console.log('Added chunk_count column to existing table');
        } catch (err) {
            // Column already exists or table doesn't exist yet - that's okay
            if (err.message && err.message.includes('already exists')) {
                console.log('chunk_count column already exists');
            } else {
                console.log('chunk_count column check completed (may not exist yet)');
            }
        }

        console.log(`[Initialize] Creating table: ${db}.${schema}.uploaded_file_chunks`);
        await executeSnowflakeSQL(createChunksTableSQL);
        console.log(`[Initialize] ✓ Table ${db}.${schema}.uploaded_file_chunks created/verified`);
    } catch (err) {
        console.error('Failed to initialize uploaded_files tables:', err.message);
        if (err.response && err.response.data) {
            console.error('Error details:', JSON.stringify(err.response.data, null, 2));
        }
        // Don't throw - allow app to continue even if table creation fails
    }
}

function escapeSQLString(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

async function saveConversation(conversationId, sessionId, title, messages, userId = null, projectId = null) {
    // Use executeSnowflakeSQL which handles agent configuration automatically
    // It will find an agent with warehouse configured for SQL operations

    if (!conversationId || !sessionId) {
        console.warn('[saveConversation] Missing conversationId or sessionId, skipping save');
        return;
    }

    const messagesJson = JSON.stringify(messages);
    const escapedTitle = escapeSQLString(title);
    const escapedMessagesJson = escapeSQLString(messagesJson);
    const escapedConversationId = escapeSQLString(conversationId);
    const escapedSessionId = escapeSQLString(sessionId);
    const escapedUserId = userId ? escapeSQLString(userId) : 'NULL';
    const escapedProjectId = projectId ? escapeSQLString(projectId) : 'NULL';

    // Get fully qualified table name
    const tableName = getTableName('conversations');
    console.log('[saveConversation] Table name:', tableName);

    // Use SELECT instead of VALUES for PARSE_JSON compatibility
    // Use uppercase column names for Snowflake compatibility
    const sql = `
        MERGE INTO ${tableName} AS t
        USING (
            SELECT 
                '${escapedConversationId}' AS CONVERSATION_ID,
                ${escapedUserId !== 'NULL' ? `'${escapedUserId}'` : 'NULL'} AS USER_ID,
                ${escapedProjectId !== 'NULL' ? `'${escapedProjectId}'` : 'NULL'} AS PROJECT_ID,
                '${escapedSessionId}' AS SESSION_ID,
                '${escapedTitle}' AS TITLE,
                PARSE_JSON('${escapedMessagesJson}') AS MESSAGES
        ) AS s
        ON t.CONVERSATION_ID = s.CONVERSATION_ID
        WHEN MATCHED THEN
            UPDATE SET 
                USER_ID = COALESCE(s.USER_ID, t.USER_ID),
                PROJECT_ID = COALESCE(s.PROJECT_ID, t.PROJECT_ID),
                TITLE = s.TITLE,
                MESSAGES = s.MESSAGES,
                UPDATED_AT = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN
            INSERT (CONVERSATION_ID, USER_ID, PROJECT_ID, SESSION_ID, TITLE, MESSAGES, CREATED_AT, UPDATED_AT)
            VALUES (s.CONVERSATION_ID, s.USER_ID, s.PROJECT_ID, s.SESSION_ID, s.TITLE, s.MESSAGES, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `;

    try {
        console.log(`[saveConversation] Saving conversation: ${conversationId} to table: ${tableName}`);
        console.log(`[saveConversation] Title: ${title}, Messages count: ${messages?.length || 0}`);
        console.log(`[saveConversation] SQL (first 500 chars): ${sql.substring(0, 500)}...`);

        const result = await executeSnowflakeSQL(sql);

        console.log(`[saveConversation] ✅ Successfully saved conversation: ${conversationId}`);
        console.log(`[saveConversation] Result:`, JSON.stringify(result, null, 2));
        return result;
    } catch (err) {
        console.error('[saveConversation] ❌ Failed to save conversation:', err.message);
        console.error('[saveConversation] Conversation ID:', conversationId);
        console.error('[saveConversation] Session ID:', sessionId);
        console.error('[saveConversation] Table name:', tableName);
        console.error('[saveConversation] SQL (first 500 chars):', sql.substring(0, 500));
        if (err.response?.data) {
            console.error('[saveConversation] Error details:', JSON.stringify(err.response.data, null, 2));
        }
        console.error('[saveConversation] Full error:', err);
        // Don't throw - allow app to continue even if save fails
        // But log extensively for debugging
    }
}

async function getConversation(conversationId, userId = null, isAdmin = false) {
    const escapedConversationId = escapeSQLString(conversationId);
    const tableName = getTableName('conversations');
    
    // Use explicit uppercase column names for Snowflake compatibility
    let sql = `
        SELECT 
            CONVERSATION_ID, 
            USER_ID,
            PROJECT_ID,
            SESSION_ID, 
            TITLE, 
            MESSAGES, 
            CREATED_AT, 
            UPDATED_AT,
            COALESCE(IS_LIKED, FALSE) AS IS_LIKED,
            FEEDBACK,
            FEEDBACK_SUBMITTED_AT
        FROM ${tableName} 
        WHERE CONVERSATION_ID = '${escapedConversationId}'
    `;
    if (!isAdmin && userId) {
        const escapedUserId = escapeSQLString(userId);
        sql += ` AND (USER_ID = '${escapedUserId}' OR USER_ID IS NULL)`;
    }

    try {
        console.log('[getConversation] Executing SQL:', sql);
        console.log('[getConversation] Table:', tableName);
        const result = await executeSnowflakeSQL(sql);
        console.log('[getConversation] Result:', JSON.stringify(result, null, 2));
        
        if (result.data && result.data.length > 0) {
            const row = result.data[0];
            console.log('[getConversation] Row data:', JSON.stringify(row, null, 2));
            
            // Map columns by position - standard order for conversations table
            const conversationId = row[0] || null;
            const userId = row[1] || null;
            const projectId = row[2] || null;
            const sessionId = row[3] || null;
            const title = row[4] || null;
            const messages = row[5];
            const createdAt = row[6] || null;
            const updatedAt = row[7] || null;
            const isLiked = row[8] === true || row[8] === 'TRUE' || row[8] === 1 || row[8] === '1';
            const feedback = row[9] || null;
            const feedbackSubmittedAt = row[10] || null;
            
            // Parse messages
            let parsedMessages = [];
            if (messages) {
                if (typeof messages === 'string') {
                    try {
                        parsedMessages = JSON.parse(messages);
                    } catch (parseErr) {
                        console.warn('[getConversation] Failed to parse messages JSON:', parseErr.message);
                        parsedMessages = [];
                    }
                } else if (Array.isArray(messages)) {
                    parsedMessages = messages;
                } else if (typeof messages === 'object') {
                    parsedMessages = messages;
                }
            }
            
            return {
                id: conversationId,
                userId: userId,
                projectId: projectId,
                sessionId: sessionId,
                title: title,
                messages: parsedMessages,
                createdAt: createdAt,
                updatedAt: updatedAt,
                isLiked: isLiked,
                feedback: feedback,
                feedbackSubmittedAt: feedbackSubmittedAt
            };
        }
        console.log('[getConversation] No conversation found');
        return null;
    } catch (err) {
        console.error('[getConversation] ERROR:', err.message);
        console.error('[getConversation] SQL:', sql);
        console.error('[getConversation] Table:', tableName);
        if (err.response?.data) {
            console.error('[getConversation] Error details:', JSON.stringify(err.response.data, null, 2));
        }
        if (err.stack) {
            console.error('[getConversation] Stack:', err.stack);
        }
        return null;
    }
}

async function getAllConversations(sessionId, searchQuery = null, userId = null, isAdmin = false, filterUserId = null, projectId = null) {
    const tableName = getTableName('conversations');
    
    console.log(`[getAllConversations] ==========================================`);
    console.log(`[getAllConversations] Table: ${tableName}`);
    console.log(`[getAllConversations] Params: sessionId=${sessionId}, userId=${userId}, isAdmin=${isAdmin}, filterUserId=${filterUserId}, projectId=${projectId}`);
    
    // First, let's check what's actually in the table - run a simple COUNT query
    try {
        const countSQL = `SELECT COUNT(*) as total FROM ${tableName}`;
        console.log(`[getAllConversations] Checking total count: ${countSQL}`);
        const countResult = await executeSnowflakeSQL(countSQL);
        console.log(`[getAllConversations] Total conversations in table:`, JSON.stringify(countResult, null, 2));
    } catch (countErr) {
        console.error(`[getAllConversations] Error getting count:`, countErr.message);
    }
    
    // Try querying with lowercase column names first (Snowflake might store them as lowercase)
    // Then try uppercase if that doesn't work
    let sql = `
        SELECT 
            conversation_id, 
            user_id,
            project_id,
            session_id, 
            title, 
            messages, 
            created_at, 
            updated_at
        FROM ${tableName} 
        WHERE 1=1
    `;
    
    // For non-admin users, filter by their user_id only (don't include NULL to avoid duplicates)
    if (!isAdmin && userId) {
        const escapedUserId = escapeSQLString(userId);
        sql += ` AND user_id = '${escapedUserId}'`;
        console.log(`[getAllConversations] Added user filter: user_id = '${escapedUserId}'`);
    }
    
    // For admin users, optionally filter by specific user_id
    if (isAdmin && filterUserId) {
        const escapedFilterUserId = escapeSQLString(filterUserId);
        sql += ` AND user_id = '${escapedFilterUserId}'`;
        console.log(`[getAllConversations] Added admin user filter: user_id = '${escapedFilterUserId}'`);
    }
    
    // Filter by project_id if provided (null means global conversations)
    if (projectId !== undefined && projectId !== null) {
        const escapedProjectId = escapeSQLString(projectId);
        sql += ` AND project_id = '${escapedProjectId}'`;
        console.log(`[getAllConversations] Added project filter: project_id = '${escapedProjectId}'`);
    } else if (projectId === null) {
        // Explicitly filter for global conversations (project_id IS NULL)
        sql += ` AND (project_id IS NULL OR project_id = '')`;
        console.log(`[getAllConversations] Added global project filter: project_id IS NULL`);
    }
    
    // Note: sessionId is NOT used as a filter to allow conversations across different sessions/devices
    // Conversations are filtered by user_id and project_id only, which are the real identifiers
    // sessionId is still returned in the response for reference
    if (sessionId) {
        console.log(`[getAllConversations] SessionId provided: ${sessionId} (not filtering by it - showing all user conversations)`);
    } else {
        console.log(`[getAllConversations] No sessionId provided - showing all conversations for user`);
    }

    // Add search filter if provided
    if (searchQuery && searchQuery.trim()) {
        const escapedSearch = escapeSQLString(searchQuery.trim());
        sql += ` AND (title ILIKE '%${escapedSearch}%' OR messages::STRING ILIKE '%${escapedSearch}%')`;
        console.log(`[getAllConversations] Added search filter`);
    }

    sql += ` ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`;

    try {
        console.log(`[getAllConversations] Final SQL: ${sql}`);
        const result = await executeSnowflakeSQL(sql);
        console.log(`[getAllConversations] Raw result structure:`, {
            hasData: !!result.data,
            dataLength: result.data?.length,
            dataType: Array.isArray(result.data) ? 'array' : typeof result.data,
            keys: result.data ? Object.keys(result.data) : null
        });
        
        if (result.data && Array.isArray(result.data) && result.data.length > 0) {
            console.log(`[getAllConversations] Found ${result.data.length} rows`);
            console.log(`[getAllConversations] First row:`, JSON.stringify(result.data[0], null, 2));
            console.log(`[getAllConversations] First row length:`, result.data[0]?.length);
            
            const conversations = result.data.map((row, index) => {
                console.log(`[getAllConversations] Processing row ${index}, length: ${row?.length}`);
                
                // Handle both array and object responses from Snowflake
                let conversationId, userId, projectId, sessionId, title, messages, createdAt, updatedAt, isLiked, feedback, feedbackSubmittedAt;
                
                if (Array.isArray(row)) {
                    // Array response
                    conversationId = row[0] || null;
                    userId = row[1] || null;
                    projectId = row[2] || null;
                    sessionId = row[3] || null;
                    title = row[4] || null;
                    messages = row[5];
                    createdAt = row[6] || null;
                    updatedAt = row[7] || null;
                    isLiked = row[8] === true || row[8] === 'TRUE' || row[8] === 1 || row[8] === '1';
                    feedback = row[9] || null;
                    feedbackSubmittedAt = row[10] || null;
                } else if (typeof row === 'object' && row !== null) {
                    // Object response (column names as keys)
                    conversationId = row.CONVERSATION_ID || row.conversation_id || null;
                    userId = row.USER_ID || row.user_id || null;
                    projectId = row.PROJECT_ID || row.project_id || null;
                    sessionId = row.SESSION_ID || row.session_id || null;
                    title = row.TITLE || row.title || null;
                    messages = row.MESSAGES || row.messages;
                    createdAt = row.CREATED_AT || row.created_at || null;
                    updatedAt = row.UPDATED_AT || row.updated_at || null;
                    isLiked = (row.IS_LIKED || row.is_liked) === true || (row.IS_LIKED || row.is_liked) === 'TRUE' || (row.IS_LIKED || row.is_liked) === 1;
                    feedback = row.FEEDBACK || row.feedback || null;
                    feedbackSubmittedAt = row.FEEDBACK_SUBMITTED_AT || row.feedback_submitted_at || null;
                } else {
                    console.warn(`[getAllConversations] Row ${index} is not array or object:`, typeof row);
                    return null;
                }
                
                // Parse messages
                let parsedMessages = [];
                if (messages) {
                    if (typeof messages === 'string') {
                        try {
                            parsedMessages = JSON.parse(messages);
                        } catch (parseErr) {
                            console.warn(`[getAllConversations] Row ${index}: Failed to parse messages JSON:`, parseErr.message);
                            parsedMessages = [];
                        }
                    } else if (Array.isArray(messages)) {
                        parsedMessages = messages;
                    } else if (typeof messages === 'object') {
                        parsedMessages = messages;
                    }
                }
                
                const conv = {
                    id: conversationId,
                    userId: userId,
                    projectId: projectId,
                    sessionId: sessionId,
                    title: title,
                    messages: parsedMessages,
                    createdAt: createdAt,
                    updatedAt: updatedAt,
                    isLiked: isLiked,
                    feedback: feedback,
                    feedbackSubmittedAt: feedbackSubmittedAt
                };
                
                console.log(`[getAllConversations] Mapped row ${index}:`, JSON.stringify(conv, null, 2));
                return conv;
            }).filter(conv => conv !== null && conv.id !== null);
            
            console.log(`[getAllConversations] Successfully mapped ${conversations.length} conversations`);
            console.log(`[getAllConversations] ==========================================`);
            return conversations;
        } else {
            console.log(`[getAllConversations] No data found. Result:`, JSON.stringify(result, null, 2));
            console.log(`[getAllConversations] ==========================================`);
        }
        return [];
    } catch (err) {
        console.error('[getAllConversations] ERROR:', err.message);
        console.error('[getAllConversations] SQL:', sql);
        console.error('[getAllConversations] Table name:', tableName);
        if (err.response?.data) {
            console.error('[getAllConversations] Error details:', JSON.stringify(err.response.data, null, 2));
        }
        if (err.stack) {
            console.error('[getAllConversations] Stack:', err.stack);
        }
        console.log(`[getAllConversations] ==========================================`);
        return [];
    }
}

async function deleteConversation(conversationId, userId = null, isAdmin = false) {
    const escapedConversationId = escapeSQLString(conversationId);
    const tableName = getTableName('conversations');
    
    // Build SQL with user filtering (unless admin)
    let sql = `DELETE FROM ${tableName} WHERE conversation_id = '${escapedConversationId}'`;
    if (!isAdmin && userId) {
        const escapedUserId = escapeSQLString(userId);
        sql += ` AND user_id = '${escapedUserId}'`;
    }

    try {
        await executeSnowflakeSQL(sql);
        return true;
    } catch (err) {
        console.error('Failed to delete conversation:', err.message);
        throw err;
    }
}

// Delete all conversations for a user (or all users if admin)
// sessionId is ignored - delete all conversations for user/project regardless of sessionId
async function deleteAllConversations(sessionId, userId = null, isAdmin = false) {
    const tableName = getTableName('conversations');
    
    // Build SQL with user filtering (unless admin)
    // Delete ALL conversations (both with project_id and without project_id)
    // Don't filter by sessionId - delete all conversations for the user across all sessions/devices
    let sql = `DELETE FROM ${tableName} WHERE 1=1`;
    if (!isAdmin && userId) {
        const escapedUserId = escapeSQLString(userId);
        sql += ` AND user_id = '${escapedUserId}'`;
    }

    try {
        console.log(`[deleteAllConversations] ==========================================`);
        console.log(`[deleteAllConversations] SessionId: ${sessionId} (ignored - deleting all for user)`);
        console.log(`[deleteAllConversations] UserId: ${userId}`);
        console.log(`[deleteAllConversations] IsAdmin: ${isAdmin}`);
        console.log(`[deleteAllConversations] Table: ${tableName}`);
        console.log(`[deleteAllConversations] Executing SQL: ${sql}`);
        
        // First, check how many conversations exist before deletion
        // Use lowercase column names to match table definition
        // Don't filter by sessionId - count all conversations for user
        let countBeforeSql = `SELECT COUNT(*) as COUNT FROM ${tableName} WHERE 1=1`;
        if (!isAdmin && userId) {
            const escapedUserId = escapeSQLString(userId);
            countBeforeSql += ` AND user_id = '${escapedUserId}'`;
        }
        
        const countBeforeResult = await executeSnowflakeSQL(countBeforeSql);
        let countBefore = 0;
        if (countBeforeResult?.data && Array.isArray(countBeforeResult.data) && countBeforeResult.data.length > 0) {
            const firstRow = countBeforeResult.data[0];
            if (Array.isArray(firstRow) && firstRow.length > 0) {
                countBefore = Number(firstRow[0]) || 0;
            }
        }
        console.log(`[deleteAllConversations] Conversations before delete: ${countBefore}`);
        
        // Execute the DELETE
        const result = await executeSnowflakeSQL(sql);
        console.log(`[deleteAllConversations] Delete result:`, JSON.stringify(result, null, 2));
        
        // Wait a moment for the DELETE to commit
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify deletion by checking count - check both with and without project_id filter
        // Use lowercase column names to match table definition
        // Don't filter by sessionId - count all conversations for user
        let countSql = `SELECT COUNT(*) as COUNT FROM ${tableName} WHERE 1=1`;
        if (!isAdmin && userId) {
            const escapedUserId = escapeSQLString(userId);
            countSql += ` AND user_id = '${escapedUserId}'`;
        }
        
        // Also check specifically for global conversations (NULL project_id)
        // Don't filter by sessionId - count all global conversations for user
        let globalCountSql = `SELECT COUNT(*) as COUNT FROM ${tableName} WHERE (project_id IS NULL OR project_id = '')`;
        if (!isAdmin && userId) {
            const escapedUserId = escapeSQLString(userId);
            globalCountSql += ` AND user_id = '${escapedUserId}'`;
        }
        
        try {
            const countResult = await executeSnowflakeSQL(countSql);
            console.log(`[deleteAllConversations] Total count query result:`, JSON.stringify(countResult, null, 2));
            
            const globalCountResult = await executeSnowflakeSQL(globalCountSql);
            console.log(`[deleteAllConversations] Global count query result:`, JSON.stringify(globalCountResult, null, 2));
            
            // Handle different result formats
            let remainingCount = 0;
            let remainingGlobalCount = 0;
            
            // Parse total count
            if (countResult?.data && Array.isArray(countResult.data) && countResult.data.length > 0) {
                const firstRow = countResult.data[0];
                if (Array.isArray(firstRow) && firstRow.length > 0) {
                    remainingCount = Number(firstRow[0]) || 0;
                } else if (typeof firstRow === 'object' && firstRow !== null) {
                    remainingCount = Number(firstRow.COUNT || firstRow.count || 0);
                }
            } else if (Array.isArray(countResult) && countResult.length > 0) {
                const firstRow = countResult[0];
                if (Array.isArray(firstRow) && firstRow.length > 0) {
                    remainingCount = Number(firstRow[0]) || 0;
                } else if (typeof firstRow === 'object' && firstRow !== null) {
                    remainingCount = Number(firstRow.COUNT || firstRow.count || 0);
                }
            }
            
            // Parse global count
            if (globalCountResult?.data && Array.isArray(globalCountResult.data) && globalCountResult.data.length > 0) {
                const firstRow = globalCountResult.data[0];
                if (Array.isArray(firstRow) && firstRow.length > 0) {
                    remainingGlobalCount = Number(firstRow[0]) || 0;
                } else if (typeof firstRow === 'object' && firstRow !== null) {
                    remainingGlobalCount = Number(firstRow.COUNT || firstRow.count || 0);
                }
            } else if (Array.isArray(globalCountResult) && globalCountResult.length > 0) {
                const firstRow = globalCountResult[0];
                if (Array.isArray(firstRow) && firstRow.length > 0) {
                    remainingGlobalCount = Number(firstRow[0]) || 0;
                } else if (typeof firstRow === 'object' && firstRow !== null) {
                    remainingGlobalCount = Number(firstRow.COUNT || firstRow.count || 0);
                }
            }
            
            console.log(`[deleteAllConversations] Remaining total conversations: ${remainingCount}`);
            console.log(`[deleteAllConversations] Remaining global conversations (NULL project_id): ${remainingGlobalCount}`);
            
            if (remainingCount > 0) {
                console.error(`[deleteAllConversations] ERROR: ${remainingCount} conversations still exist after delete`);
                console.error(`[deleteAllConversations] Global conversations (NULL project_id): ${remainingGlobalCount}`);
                console.error(`[deleteAllConversations] This indicates the DELETE did not work as expected`);
                // Throw error to indicate deletion didn't work
                throw new Error(`Failed to delete all conversations. ${remainingCount} conversations still exist (${remainingGlobalCount} global).`);
            } else {
                console.log(`[deleteAllConversations] ✓ All conversations successfully deleted (total: ${remainingCount}, global: ${remainingGlobalCount})`);
            }
        } catch (countErr) {
            // If it's our intentional error, re-throw it
            if (countErr.message.includes('Failed to delete all conversations')) {
                throw countErr;
            }
            console.warn(`[deleteAllConversations] Could not verify deletion count:`, countErr.message);
            // Don't fail the operation if verification fails (might be a query issue, not a delete issue)
        }
        
        return true;
    } catch (err) {
        console.error('[deleteAllConversations] Failed to delete all conversations:', err.message);
        console.error('[deleteAllConversations] SQL:', sql);
        throw err;
    }
}

// Delete all conversations for a specific project
// sessionId is ignored - delete all conversations for user/project regardless of sessionId
async function deleteProjectConversations(sessionId, projectId, userId = null, isAdmin = false) {
    const tableName = getTableName('conversations');
    const escapedProjectId = escapeSQLString(projectId);
    
    // Build SQL with user and project filtering (unless admin)
    // Don't filter by sessionId - delete all conversations for user/project across all sessions/devices
    let sql = `DELETE FROM ${tableName} WHERE project_id = '${escapedProjectId}'`;
    if (!isAdmin && userId) {
        const escapedUserId = escapeSQLString(userId);
        sql += ` AND user_id = '${escapedUserId}'`;
    }

    try {
        await executeSnowflakeSQL(sql);
        return true;
    } catch (err) {
        console.error('Failed to delete project conversations:', err.message);
        throw err;
    }
}

// Get lightweight conversation metadata (without messages) for list view
async function getAllConversationsMetadata(sessionId, searchQuery = null, userId = null, isAdmin = false, filterUserId = null, projectId = null) {
    const tableName = getTableName('conversations');
    
    console.log(`[getAllConversationsMetadata] Getting lightweight metadata for session: ${sessionId}`);
    
    // Query only metadata fields, not messages (much faster)
    // Note: last_message_preview extraction is simplified - can be enhanced later
    let sql = `
        SELECT 
            conversation_id, 
            user_id,
            project_id,
            session_id, 
            title, 
            created_at, 
            updated_at,
            COALESCE(IS_LIKED, FALSE) AS IS_LIKED,
            FEEDBACK,
            FEEDBACK_SUBMITTED_AT,
            -- Extract a preview from messages JSON (simplified - just get first 100 chars of JSON string)
            CASE 
                WHEN messages IS NOT NULL THEN
                    SUBSTRING(messages::STRING, 1, 100)
                ELSE NULL
            END as last_message_preview
        FROM ${tableName} 
        WHERE 1=1
    `;
    
    // For non-admin users, filter by their user_id only (don't include NULL to avoid duplicates)
    if (!isAdmin && userId) {
        const escapedUserId = escapeSQLString(userId);
        sql += ` AND user_id = '${escapedUserId}'`;
    }
    
    // For admin users, optionally filter by specific user_id
    if (isAdmin && filterUserId) {
        const escapedFilterUserId = escapeSQLString(filterUserId);
        sql += ` AND user_id = '${escapedFilterUserId}'`;
    }
    
    // Filter by project_id if provided (null means global conversations)
    if (projectId !== undefined && projectId !== null) {
        const escapedProjectId = escapeSQLString(projectId);
        sql += ` AND project_id = '${escapedProjectId}'`;
    } else if (projectId === null) {
        // Explicitly filter for global conversations (project_id IS NULL)
        sql += ` AND (project_id IS NULL OR project_id = '')`;
    }
    
    // Note: sessionId is NOT used as a filter to allow conversations across different sessions/devices
    // Conversations are filtered by user_id and project_id only, which are the real identifiers
    // sessionId is still returned in the response for reference
    if (sessionId) {
        console.log(`[getAllConversationsMetadata] SessionId provided: ${sessionId} (not filtering by it - showing all user conversations)`);
    } else {
        console.log(`[getAllConversationsMetadata] No sessionId provided - showing all conversations for user`);
    }
    
    // Add search filter if provided
    if (searchQuery && searchQuery.trim()) {
        const escapedSearch = escapeSQLString(searchQuery.trim());
        sql += ` AND (title ILIKE '%${escapedSearch}%' OR messages::STRING ILIKE '%${escapedSearch}%')`;
    }
    
    sql += ` ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`;
    
    try {
        const result = await executeSnowflakeSQL(sql);
        
        if (result.data && Array.isArray(result.data) && result.data.length > 0) {
            const conversations = result.data.map((row) => {
                const conversationId = row[0] || null;
                const userId = row[1] || null;
                const projectId = row[2] || null;
                const sessionId = row[3] || null;
                const title = row[4] || null;
                const createdAt = row[5] || null;
                const updatedAt = row[6] || null;
                const isLiked = row[7] === true || row[7] === 'TRUE' || row[7] === 1 || row[7] === '1';
                const feedback = row[8] || null;
                const feedbackSubmittedAt = row[9] || null;
                const lastMessagePreview = row[10] || null;
                
                return {
                    id: conversationId,
                    userId: userId,
                    projectId: projectId,
                    sessionId: sessionId,
                    title: title,
                    createdAt: createdAt,
                    updatedAt: updatedAt,
                    isLiked: isLiked,
                    feedback: feedback,
                    feedbackSubmittedAt: feedbackSubmittedAt,
                    lastMessagePreview: lastMessagePreview
                };
            }).filter(conv => conv !== null && conv.id !== null);
            
            return conversations;
        }
        return [];
    } catch (err) {
        console.error('[getAllConversationsMetadata] ERROR:', err.message);
        throw err;
    }
}

// Get conversation counts (total and per project)
async function getConversationCounts(userId = null, isAdmin = false, projectId = null) {
    const tableName = getTableName('conversations');
    
    try {
        // Build base WHERE clause
        let whereClause = 'WHERE 1=1';
        
        // For non-admin users, filter by their user_id only (don't include NULL user_id to avoid duplicates)
        if (!isAdmin && userId) {
            const escapedUserId = escapeSQLString(userId);
            whereClause += ` AND user_id = '${escapedUserId}'`;
        }
        
        // Filter by specific project if provided
        if (projectId !== undefined && projectId !== null) {
            const escapedProjectId = escapeSQLString(projectId);
            whereClause += ` AND project_id = '${escapedProjectId}'`;
        }
        
        // Get total count (all conversations for user)
        const totalSql = `SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`;
        const totalResult = await executeSnowflakeSQL(totalSql);
        const totalCount = totalResult.data && totalResult.data.length > 0 
            ? parseInt(totalResult.data[0][0] || 0, 10) 
            : 0;
        
        // Get global count (conversations without project, for the user)
        // Build separate where clause for global count
        let globalWhereClause = 'WHERE 1=1';
        if (!isAdmin && userId) {
            const escapedUserId = escapeSQLString(userId);
            globalWhereClause += ` AND user_id = '${escapedUserId}'`;
        }
        // Global conversations are those without a project_id
        globalWhereClause += ` AND (project_id IS NULL OR project_id = '')`;
        
        const globalSql = `SELECT COUNT(*) as global FROM ${tableName} ${globalWhereClause}`;
        const globalResult = await executeSnowflakeSQL(globalSql);
        const globalCount = globalResult.data && globalResult.data.length > 0 
            ? parseInt(globalResult.data[0][0] || 0, 10) 
            : 0;
        
        // Get counts per project (only if not filtering by specific project)
        const projectCounts = {};
        if (projectId === undefined || projectId === null) {
            // Build where clause for project counts (exclude NULL project_id)
            let projectWhereClause = 'WHERE 1=1';
            if (!isAdmin && userId) {
                const escapedUserId = escapeSQLString(userId);
                projectWhereClause += ` AND user_id = '${escapedUserId}'`;
            }
            // Only count conversations that have a project_id (not NULL)
            projectWhereClause += ` AND project_id IS NOT NULL AND project_id != ''`;
            
            const projectSql = `
                SELECT 
                    project_id,
                    COUNT(*) as project_count
                FROM ${tableName}
                ${projectWhereClause}
                GROUP BY project_id
            `;
            const projectResult = await executeSnowflakeSQL(projectSql);
            
            if (projectResult.data && Array.isArray(projectResult.data)) {
                projectResult.data.forEach((row) => {
                    const projId = row[0] || null;
                    const count = parseInt(row[1] || 0, 10);
                    if (projId && projId !== '') {
                        projectCounts[projId] = count;
                    }
                });
            }
        }
        
        return {
            total: totalCount,
            global: globalCount,
            byProject: projectCounts
        };
    } catch (err) {
        console.error('[getConversationCounts] ERROR:', err.message);
        throw err;
    }
}

function normalizeUrl(url) {
    if (!url) return null;

    // Remove leading/trailing whitespace
    url = url.trim();

    // If it already has a protocol, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }

    // Otherwise, add https://
    return `https://${url}`;
}

// Thread Management Functions
async function createSnowflakeThread(originApplication = null, agentId = null) {
    const agentConfig = getAgentConfig(agentId);
    if (!agentConfig) {
        throw new Error(`Agent with ID '${agentId}' not found`);
    }

    const token = agentConfig.bearerToken || SF_BEARER_TOKEN;
    const normalizedUrl = normalizeUrl(agentConfig.accountUrl || SF_ACCOUNT_URL);

    if (!token || !normalizedUrl) {
        throw new Error('Missing Snowflake configuration for thread creation');
    }

    const threadUrl = `${normalizedUrl.replace(/\/$/, '')}/api/v2/cortex/threads`;

    try {
        const requestBody = {};
        if (originApplication) {
            requestBody.origin_application = originApplication;
        }

        const response = await axios.post(
            threadUrl,
            requestBody,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Extract thread_id - Snowflake returns thread UUID as string, but handle object response if needed
        let threadId = response.data;
        if (typeof threadId === 'object' && threadId !== null) {
            threadId = threadId.thread_id || threadId.threadId || threadId.id || threadId;
        }

        console.log('[Backend] Created thread with ID:', threadId);
        return threadId; // Returns thread UUID as string/number
    } catch (err) {
        console.error('Thread creation error:', err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
        throw err;
    }
}

async function describeSnowflakeThread(threadId, pageSize = 20, lastMessageId = null) {
    const token = getSnowflakeToken();
    const normalizedUrl = normalizeUrl(SF_ACCOUNT_URL);

    if (!token || !normalizedUrl) {
        throw new Error('Missing Snowflake configuration for thread description');
    }

    let threadUrl = `${normalizedUrl.replace(/\/$/, '')}/api/v2/cortex/threads/${threadId}?page_size=${pageSize}`;
    if (lastMessageId) {
        threadUrl += `&last_message_id=${lastMessageId}`;
    }

    try {
        const response = await axios.get(
            threadUrl,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (err) {
        console.error('Thread description error:', err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
        throw err;
    }
}

async function updateSnowflakeThread(threadId, threadName) {
    const token = getSnowflakeToken();
    const normalizedUrl = normalizeUrl(SF_ACCOUNT_URL);

    if (!token || !normalizedUrl) {
        throw new Error('Missing Snowflake configuration for thread update');
    }

    const threadUrl = `${normalizedUrl.replace(/\/$/, '')}/api/v2/cortex/threads/${threadId}`;

    try {
        const response = await axios.post(
            threadUrl,
            { thread_name: threadName },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (err) {
        console.error('Thread update error:', err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
        throw err;
    }
}

async function listSnowflakeThreads(originApplication = null) {
    const token = getSnowflakeToken();
    const normalizedUrl = normalizeUrl(SF_ACCOUNT_URL);

    if (!token || !normalizedUrl) {
        throw new Error('Missing Snowflake configuration for thread listing');
    }

    let threadUrl = `${normalizedUrl.replace(/\/$/, '')}/api/v2/cortex/threads`;
    if (originApplication) {
        threadUrl += `?origin_application=${encodeURIComponent(originApplication)}`;
    }

    try {
        const response = await axios.get(
            threadUrl,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (err) {
        console.error('Thread listing error:', err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
        throw err;
    }
}

async function deleteSnowflakeThread(threadId) {
    const token = getSnowflakeToken();
    const normalizedUrl = normalizeUrl(SF_ACCOUNT_URL);

    if (!token || !normalizedUrl) {
        throw new Error('Missing Snowflake configuration for thread deletion');
    }

    const threadUrl = `${normalizedUrl.replace(/\/$/, '')}/api/v2/cortex/threads/${threadId}`;

    try {
        const response = await axios.delete(
            threadUrl,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (err) {
        console.error('Thread deletion error:', err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
        throw err;
    }
}

function validateUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

async function streamSnowflakeAgent({ requestBody, res, req, agentId }) {
    // Get agent configuration
    const agentConfig = getAgentConfig(agentId);

    if (!agentConfig) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: `Agent with ID '${agentId}' not found` })}\n\n`);
        res.end();
        return;
    }

    const token = agentConfig.bearerToken || getSnowflakeToken();

    // Validate all required configuration
    if (!token || !agentConfig.accountUrl || !agentConfig.db || !agentConfig.schema || !agentConfig.agent) {
        console.warn(`[Backend] Missing Snowflake configuration for agent ${agentId}, falling back to mock`);
        const mockMessage = requestBody.messages?.[0]?.content?.[0]?.text || 'Hello';
        res.write(`data: ${JSON.stringify({ type: 'text', text: `[MOCK] You said: "${mockMessage}"` })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        return;
    }

    // Normalize URL (add https:// if missing)
    const normalizedUrl = normalizeUrl(agentConfig.accountUrl);
    if (!normalizedUrl || !validateUrl(normalizedUrl)) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: `Invalid account URL format for agent ${agentId}` })}\n\n`);
        res.end();
        return;
    }

    // Use the request body directly - forward it exactly as received
    const agentUrl = `${normalizedUrl.replace(/\/$/, '')}/api/v2/databases/${agentConfig.db}/schemas/${agentConfig.schema}/agents/${agentConfig.agent}:run`;

    try {
        // Stream the response directly from Snowflake to the client
        // Pass the request body exactly as received - no modification
        console.log('[Backend] Sending request to Snowflake:', agentUrl);
        console.log('[Backend] Request body:', JSON.stringify(requestBody, null, 2));

        const agentResp = await axios.post(
            agentUrl,
            requestBody, // Forward the exact request body
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                responseType: 'stream', // Stream the response
                validateStatus: () => true // Don't throw on any status code - handle manually
            }
        );

        console.log('[Backend] Snowflake response status:', agentResp.status);
        console.log('[Backend] Snowflake response headers:', JSON.stringify(agentResp.headers, null, 2));

        // Handle HTTP error status codes
        if (agentResp.status >= 400) {
            console.error('[Backend] Snowflake returned error status:', agentResp.status);

            // Try to read error response
            let errorBody = '';
            agentResp.data.on('data', (chunk) => {
                errorBody += chunk.toString();
            });

            agentResp.data.on('end', () => {
                console.error('[Backend] Error response body:', errorBody);

                let errorMessage = 'Unknown error';
                let userFriendlyMessage = 'An error occurred while communicating with Snowflake.';

                try {
                    const errorData = JSON.parse(errorBody);
                    errorMessage = errorData.message || errorData.error || errorBody;

                    // Provide user-friendly messages for common errors
                    if (agentResp.status === 403) {
                        if (errorData.message && (errorData.message.includes('CORTEX_USER') || errorData.message.includes('CORTEX_AGENT_USER'))) {
                            userFriendlyMessage = 'Access Denied: You need the SNOWFLAKE.CORTEX_USER or SNOWFLAKE.CORTEX_AGENT_USER role to use Cortex Agents. Please contact your Snowflake administrator to grant you these roles.';
                        } else {
                            userFriendlyMessage = 'Access Denied: You do not have permission to use this feature.';
                        }
                    } else if (agentResp.status === 422) {
                        if (errorData.message && (errorData.message.includes('suspended') || errorData.message.includes('payment'))) {
                            userFriendlyMessage = 'Account Issue: Your Snowflake account has been suspended due to payment method issues. Please update your payment method in your Snowflake account settings.';
                        } else {
                            userFriendlyMessage = `Validation Error: ${errorData.message || 'Invalid request parameters.'}`;
                        }
                    } else if (agentResp.status === 401) {
                        userFriendlyMessage = 'Authentication Failed: Please check your Snowflake credentials and bearer token.';
                    } else {
                        userFriendlyMessage = errorData.message || `Snowflake API error (${agentResp.status})`;
                    }
                } catch (parseErr) {
                    userFriendlyMessage = `Snowflake API error (${agentResp.status}): ${errorBody || 'Unknown error'}`;
                }

                if (!res.destroyed) {
                    try {
                        res.write(`data: ${JSON.stringify({ type: 'error', error: userFriendlyMessage, details: errorMessage, status: agentResp.status })}\n\n`);
                        res.end();
                    } catch (writeErr) {
                        console.error('[Backend] Error writing error response:', writeErr.message);
                    }
                }
            });

            agentResp.data.on('error', (streamErr) => {
                console.error('[Backend] Error stream error:', streamErr.message);
                if (!res.destroyed) {
                    try {
                        res.write(`data: ${JSON.stringify({ type: 'error', error: `Snowflake API error (${agentResp.status})` })}\n\n`);
                        res.end();
                    } catch (writeErr) {
                        // Ignore
                    }
                }
            });

            return;
        }

        // Get the stream from response.data
        const stream = agentResp.data;
        let streamBuffer = '';
        let isStreamEnded = false;

        // Helper function to safely write to response
        const safeWrite = (chunk) => {
            if (!isStreamEnded && !res.destroyed) {
                try {
                    return res.write(chunk);
                } catch (writeErr) {
                    console.error('[Backend] Write error:', writeErr.message);
                    isStreamEnded = true;
                    return false;
                }
            }
            return false;
        };

        // Helper function to safely end response
        const safeEnd = () => {
            if (!isStreamEnded && !res.destroyed) {
                isStreamEnded = true;
                try {
                    res.end();
                } catch (endErr) {
                    console.error('[Backend] End error:', endErr.message);
                }
            }
        };

        // Handle stream data
        stream.on('data', (chunk) => {
            // Log chunk for debugging (first few chunks only)
            if (streamBuffer.length < 2000) {
                streamBuffer += chunk.toString();
                if (streamBuffer.length >= 500 && streamBuffer.length < 600) {
                    console.log('[Backend] First 500 chars of stream:', streamBuffer.substring(0, 500));
                }
            }

            // Write chunk to client
            const written = safeWrite(chunk);
            if (!written) {
                console.log('[Backend] Failed to write chunk - stream may be ended');
            }
        });

        stream.on('end', () => {
            console.log('[Backend] Stream ended');
            safeEnd();
        });

        stream.on('error', (err) => {
            console.error('[Backend] Stream error:', err);
            if (!isStreamEnded && !res.destroyed) {
                safeWrite(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
            }
            safeEnd();
        });

        // Handle client disconnect
        req.on('close', () => {
            console.log('[Backend] Client disconnected');
            if (!isStreamEnded) {
                isStreamEnded = true;
                try {
                    stream.destroy();
                } catch (destroyErr) {
                    // Ignore destroy errors
                }
            }
        });

        // Handle request abort
        req.on('aborted', () => {
            console.log('[Backend] Request aborted');
            if (!isStreamEnded) {
                isStreamEnded = true;
                try {
                    stream.destroy();
                } catch (destroyErr) {
                    // Ignore destroy errors
                }
            }
        });

    } catch (err) {
        console.error('[Backend] Failed to run agent:', err.message);
        if (err.response) {
            console.error('[Backend] Error response status:', err.response.status);
            console.error('[Backend] Error response data:', err.response.data);

            // Try to stream error response if available
            if (err.response.data && typeof err.response.data.pipe === 'function') {
                const errorStream = err.response.data;
                errorStream.on('data', (chunk) => {
                    if (!res.destroyed && !res.headersSent) {
                        try {
                            res.write(chunk);
                        } catch (writeErr) {
                            // Ignore write errors
                        }
                    }
                });
                errorStream.on('end', () => {
                    if (!res.destroyed) {
                        try {
                            res.end();
                        } catch (endErr) {
                            // Ignore end errors
                        }
                    }
                });
                return;
            }
        }

        if (!res.headersSent && !res.destroyed) {
            try {
                res.write(`data: ${JSON.stringify({ type: 'error', error: `Failed to run agent: ${err.message}` })}\n\n`);
                res.end();
            } catch (writeErr) {
                console.error('[Backend] Error writing error response:', writeErr.message);
            }
        }
    }
}

function buildMockReply(message) {
    return (
        "🤖 (mock) I am a demo Snowflake Cortex agent. " +
        "You said: \"" + message + "\". " +
        "Connect real Snowflake credentials in the backend to talk to an actual agent."
    );
}

/**
 * Update like status for a conversation
 */
async function updateConversationLike(conversationId, userId, isLiked) {
    const escapedConversationId = escapeSQLString(conversationId);
    const escapedUserId = escapeSQLString(userId);
    const tableName = getTableName('conversations');
    
    const sql = `
        UPDATE ${tableName}
        SET 
            is_liked = ${isLiked ? 'TRUE' : 'FALSE'},
            updated_at = CURRENT_TIMESTAMP()
        WHERE CONVERSATION_ID = '${escapedConversationId}'
        AND USER_ID = '${escapedUserId}'
    `;
    
    try {
        await executeSnowflakeSQL(sql);
        console.log(`[updateConversationLike] Updated like status for conversation ${conversationId}`);
        return true;
    } catch (err) {
        console.error('[updateConversationLike] ERROR:', err.message);
        throw err;
    }
}

/**
 * Submit feedback for a conversation
 */
async function submitConversationFeedback(conversationId, userId, feedback) {
    const escapedConversationId = escapeSQLString(conversationId);
    const escapedUserId = escapeSQLString(userId);
    const escapedFeedback = escapeSQLString(feedback);
    const tableName = getTableName('conversations');
    
    const sql = `
        UPDATE ${tableName}
        SET 
            feedback = '${escapedFeedback}',
            feedback_submitted_at = CURRENT_TIMESTAMP(),
            updated_at = CURRENT_TIMESTAMP()
        WHERE CONVERSATION_ID = '${escapedConversationId}'
        AND USER_ID = '${escapedUserId}'
    `;
    
    try {
        await executeSnowflakeSQL(sql);
        console.log(`[submitConversationFeedback] Submitted feedback for conversation ${conversationId}`);
        return true;
    } catch (err) {
        console.error('[submitConversationFeedback] ERROR:', err.message);
        throw err;
    }
}

// Export all necessary functions
module.exports = {
    executeSnowflakeSQL,
    getTableName,
    escapeSQLString,
    initializeUsersTable,
    initializeProjectsTable,
    initializeConversationsTable,
    initializeFilesTable,
    saveConversation,
    getConversation,
    updateConversationLike,
    submitConversationFeedback,
    getAllConversations,
    getAllConversationsMetadata,
    getConversationCounts,
    deleteConversation,
    deleteAllConversations,
    deleteProjectConversations,
    createSnowflakeThread,
    describeSnowflakeThread,
    updateSnowflakeThread,
    listSnowflakeThreads,
    deleteSnowflakeThread,
    streamSnowflakeAgent,
    buildMockReply,
    normalizeUrl,
    validateUrl,
    getSnowflakeToken,
    updateConversationLike,
    submitConversationFeedback
};
