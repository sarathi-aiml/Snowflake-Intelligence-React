/**
 * Project database operations for Snowflake
 * Handles project creation, retrieval, and updates
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
 * Create a new project
 */
async function createProject(name, description, createdBy) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const projectId = uuidv4();
    const escapedName = escapeSQLString(name);
    const escapedDescription = description ? escapeSQLString(description) : '';
    const escapedCreatedBy = escapeSQLString(createdBy);

    const tableName = getTableName('projects');

    const createSQL = `
        INSERT INTO ${tableName} (id, name, description, created_by, created_at, updated_at)
        VALUES (
            '${projectId}',
            '${escapedName}',
            '${escapedDescription}',
            '${escapedCreatedBy}',
            CURRENT_TIMESTAMP(),
            CURRENT_TIMESTAMP()
        )
    `;

    try {
        await executeSnowflakeSQL(createSQL);
        return await getProjectById(projectId);
    } catch (err) {
        console.error('[createProject] Error:', err.message);
        throw err;
    }
}

/**
 * Get project by ID with optional conversation count
 * @param {string} projectId - Project ID
 * @param {boolean} includeCount - Whether to include conversation count (default: false)
 */
async function getProjectById(projectId, includeCount = false) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const escapedProjectId = escapeSQLString(projectId);
    const projectsTable = getTableName('projects');
    
    let sql = `
        SELECT 
            p.id,
            p.name,
            p.description,
            p.created_by,
            p.created_at,
            p.updated_at
    `;
    
    if (includeCount) {
        const conversationsTable = getTableName('conversations');
        sql += `, COALESCE(COUNT(c.id), 0) as conversations_count
        FROM ${projectsTable} p
        LEFT JOIN ${conversationsTable} c ON c.project_id = p.id
        WHERE p.id = '${escapedProjectId}'
        GROUP BY p.id, p.name, p.description, p.created_by, p.created_at, p.updated_at`;
    } else {
        sql += `
        FROM ${projectsTable} p
        WHERE p.id = '${escapedProjectId}'`;
    }

    try {
        const result = await executeSnowflakeSQL(sql);
        if (result.data && result.data.length > 0) {
            const row = result.data[0];
            const project = {
                id: row[0], // id
                name: row[1], // name
                description: row[2], // description
                createdBy: row[3], // created_by
                createdAt: row[4], // created_at
                updatedAt: row[5] // updated_at
            };
            
            if (includeCount) {
                project.conversationsCount = row[6] || 0;
            }
            
            return project;
        }
        return null;
    } catch (err) {
        console.error('[getProjectById] Error:', err.message);
        return null;
    }
}

/**
 * Get all projects with conversation counts (optimized single query)
 * @param {number} limit - Maximum number of projects to return
 * @param {number} offset - Number of projects to skip
 * @param {string} userId - User ID to filter by (for regular users)
 * @param {boolean} isAdmin - Whether the user is an admin (admins see all projects)
 * @param {boolean} includeCounts - Whether to include conversation counts (default: true)
 */
async function getAllProjects(limit = 100, offset = 0, userId = null, isAdmin = false, includeCounts = true) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const projectsTable = getTableName('projects');
    
    // First, get projects without counts (simpler query)
    let sql = `
        SELECT 
            id,
            name,
            description,
            created_by,
            created_at,
            updated_at
        FROM ${projectsTable}
        WHERE 1=1
    `;
    
    // For non-admin users, filter by their user_id (only show projects they created)
    if (!isAdmin && userId) {
        const escapedUserId = escapeSQLString(userId);
        sql += ` AND created_by = '${escapedUserId}'`;
    }
    
    sql += `
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;

    try {
        const result = await executeSnowflakeSQL(sql);
        let projects = [];
        
        if (result.data && result.data.length > 0) {
            projects = result.data.map(row => ({
                id: row[0], // id
                name: row[1], // name
                description: row[2], // description
                createdBy: row[3], // created_by
                createdAt: row[4], // created_at
                updatedAt: row[5] // updated_at
            }));
        }
        
        // If counts are requested, fetch them separately (more reliable)
        if (includeCounts) {
            if (projects.length > 0) {
                const conversationsTable = getTableName('conversations');
                const projectIds = projects.map(p => `'${escapeSQLString(p.id)}'`).join(',');
                
                const countSql = `
                    SELECT 
                        project_id,
                        COUNT(*) as count
                    FROM ${conversationsTable}
                    WHERE project_id IN (${projectIds})
                    GROUP BY project_id
                `;
                
                try {
                    const countResult = await executeSnowflakeSQL(countSql);
                    const countsMap = {};
                    
                    if (countResult.data && countResult.data.length > 0) {
                        countResult.data.forEach(row => {
                            const projectId = row[0];
                            const count = row[1] || 0;
                            countsMap[projectId] = typeof count === 'number' ? count : parseInt(count) || 0;
                        });
                    }
                    
                    // Add counts to projects
                    projects = projects.map(project => ({
                        ...project,
                        conversationsCount: countsMap[project.id] || 0
                    }));
                } catch (countErr) {
                    console.error('[getAllProjects] Error fetching counts:', countErr.message);
                    // If count query fails, just set all to 0
                    projects = projects.map(project => ({
                        ...project,
                        conversationsCount: 0
                    }));
                }
            } else {
                // No projects - return empty array (counts not needed)
                return [];
            }
        }
        
        return projects;
    } catch (err) {
        console.error('[getAllProjects] Error:', err.message);
        console.error('[getAllProjects] SQL:', sql);
        return []; // Return empty array on error to prevent breaking the app
    }
}

/**
 * Update project
 */
async function updateProject(projectId, updates) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const escapedProjectId = escapeSQLString(projectId);
    const tableName = getTableName('projects');
    
    const updateFields = [];
    if (updates.name !== undefined) {
        updateFields.push(`name = '${escapeSQLString(updates.name)}'`);
    }
    if (updates.description !== undefined) {
        updateFields.push(`description = '${escapeSQLString(updates.description)}'`);
    }

    if (updateFields.length === 0) {
        throw new Error('No fields to update');
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP()');

    const sql = `
        UPDATE ${tableName}
        SET ${updateFields.join(', ')}
        WHERE id = '${escapedProjectId}'
    `;

    try {
        await executeSnowflakeSQL(sql);
        return await getProjectById(projectId);
    } catch (err) {
        console.error('[updateProject] Error:', err.message);
        throw err;
    }
}

/**
 * Delete project
 */
async function deleteProject(projectId) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const escapedProjectId = escapeSQLString(projectId);
    const tableName = getTableName('projects');
    const sql = `DELETE FROM ${tableName} WHERE id = '${escapedProjectId}'`;

    try {
        await executeSnowflakeSQL(sql);
        return true;
    } catch (err) {
        console.error('[deleteProject] Error:', err.message);
        throw err;
    }
}

/**
 * Get conversations count for a project
 * @deprecated Use getAllProjects with includeCounts=true instead for better performance
 */
async function getProjectConversationsCount(projectId) {
    const { executeSnowflakeSQL, getTableName } = getServerHelpers();
    const escapedProjectId = escapeSQLString(projectId);
    const conversationsTable = getTableName('conversations');
    const sql = `
        SELECT COUNT(*) as count
        FROM ${conversationsTable}
        WHERE project_id = '${escapedProjectId}'
    `;

    try {
        const result = await executeSnowflakeSQL(sql);
        if (result.data && result.data.length > 0) {
            return result.data[0][0] || 0;
        }
        return 0;
    } catch (err) {
        console.error('[getProjectConversationsCount] Error:', err.message);
        return 0;
    }
}

module.exports = {
    createProject,
    getProjectById,
    getAllProjects,
    updateProject,
    deleteProject,
    getProjectConversationsCount
};
