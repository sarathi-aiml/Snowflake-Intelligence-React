/**
 * Agent configuration utilities
 * Handles loading and managing multiple Snowflake Cortex agents
 */

const PROJECT_NAME = process.env.PROJECT_NAME || 'AI Intelligence Platform';

// Legacy single agent support (for backward compatibility)
const SF_ACCOUNT_URL = process.env.SF_ACCOUNT_URL;
const SF_DB = process.env.SF_DB;
const SF_SCHEMA = process.env.SF_SCHEMA;
const SF_AGENT = process.env.SF_AGENT;
const SF_BEARER_TOKEN = process.env.SF_BEARER_TOKEN;
const SF_WAREHOUSE = process.env.SF_WAREHOUSE;

// Load multiple agents from environment variables
// Pattern: AGENT_1_SF_ACCOUNT_URL, AGENT_1_SF_DB, AGENT_1_SF_SCHEMA, etc.
function loadAgentsFromEnv() {
    const agents = [];
    const agentIds = new Set();

    // Find all agent IDs by scanning environment variables
    Object.keys(process.env).forEach(key => {
        const match = key.match(/^AGENT_(\d+)_/i);
        if (match) {
            agentIds.add(match[1]);
        }
    });

    // Load each agent configuration
    agentIds.forEach(agentId => {
        const prefix = `AGENT_${agentId}_`;
        const accountUrl = process.env[`${prefix}SF_ACCOUNT_URL`] || process.env[`${prefix}ACCOUNT_URL`];
        const db = process.env[`${prefix}SF_DB`] || process.env[`${prefix}DB`];
        const schema = process.env[`${prefix}SF_SCHEMA`] || process.env[`${prefix}SCHEMA`];
        const agent = process.env[`${prefix}SF_AGENT`] || process.env[`${prefix}AGENT`];
        const bearerToken = process.env[`${prefix}SF_BEARER_TOKEN`] || process.env[`${prefix}BEARER_TOKEN`] || process.env[`${prefix}TOKEN`];
        const warehouse = process.env[`${prefix}SF_WAREHOUSE`] || process.env[`${prefix}WAREHOUSE`];
        const name = process.env[`${prefix}NAME`] || process.env[`${prefix}AGENT_NAME`] || `Agent ${agentId}`;
        const project = process.env[`${prefix}PROJECT_NAME`] || process.env.PROJECT_NAME || PROJECT_NAME;

        if (accountUrl && db && schema && agent) {
            agents.push({
                id: agentId,
                name: name,
                project: project,
                accountUrl: accountUrl,
                db: db,
                schema: schema,
                agent: agent,
                bearerToken: bearerToken,
                warehouse: warehouse
            });
        }
    });

    // Sort by ID
    agents.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    // If no agents found but legacy config exists, create a default agent
    if (agents.length === 0 && SF_ACCOUNT_URL && SF_DB && SF_SCHEMA && SF_AGENT) {
        agents.push({
            id: 'default',
            name: process.env.AGENT_NAME || 'Default Agent',
            project: PROJECT_NAME,
            accountUrl: SF_ACCOUNT_URL,
            db: SF_DB,
            schema: SF_SCHEMA,
            agent: SF_AGENT,
            bearerToken: SF_BEARER_TOKEN,
            warehouse: SF_WAREHOUSE
        });
    }

    return agents;
}

// Load all agents at startup
const AVAILABLE_AGENTS = loadAgentsFromEnv();
console.log(`[Backend] Loaded ${AVAILABLE_AGENTS.length} agent(s) from environment`);
AVAILABLE_AGENTS.forEach(agent => {
    const hasWarehouse = agent.warehouse ? '✓' : '✗';
    console.log(`[Backend] - Agent ${agent.id}: ${agent.name} (${agent.project}) [Warehouse: ${hasWarehouse}]`);
    if (!agent.warehouse) {
        console.warn(`[Backend] Warning: Agent ${agent.id} does not have warehouse configured. This agent cannot be used for SQL operations (conversations storage).`);
    }
});

// Helper function to get agent configuration by ID
function getAgentConfig(agentId) {
    if (!agentId || agentId === 'default') {
        // Return first agent or legacy config
        return AVAILABLE_AGENTS.length > 0
            ? AVAILABLE_AGENTS[0]
            : {
                id: 'default',
                name: 'Default Agent',
                project: PROJECT_NAME,
                accountUrl: SF_ACCOUNT_URL,
                db: SF_DB,
                schema: SF_SCHEMA,
                agent: SF_AGENT,
                bearerToken: SF_BEARER_TOKEN,
                warehouse: SF_WAREHOUSE
            };
    }

    return AVAILABLE_AGENTS.find(a => a.id === agentId);
}

module.exports = {
    AVAILABLE_AGENTS,
    getAgentConfig,
    PROJECT_NAME
};

