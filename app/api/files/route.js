/**
 * GET /api/files - Get files for a conversation
 * POST /api/files - Upload files
 */

import { v4 as uuidv4 } from 'uuid';
import { executeSnowflakeSQL, escapeSQLString, initializeFilesTable, getTableName } from '@/lib/snowflake';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export async function GET(request) {
    try {
        const url = new URL(request.url);
        const conversationId = url.searchParams.get('conversationId');

        if (!conversationId) {
            return Response.json({ error: 'conversationId is required' }, { status: 400 });
        }

        const escapedConversationId = escapeSQLString(conversationId);
        const tableName = getTableName('uploaded_files'); // Uses schema from DB_SNOWFLAKE_SCHEMA env var
        const sql = `
            SELECT file_id, filename, file_size, mime_type, uploaded_at
            FROM ${tableName}
            WHERE conversation_id = '${escapedConversationId}'
            ORDER BY uploaded_at DESC
        `;

        const result = await executeSnowflakeSQL(sql);
        const files = (result.data || []).map(row => ({
            id: row[0],
            filename: row[1],
            size: row[2],
            mimeType: row[3],
            uploadedAt: row[4]
        }));

        return Response.json({ files });
    } catch (err) {
        console.error('Error getting files:', err.message);
        return Response.json({ error: 'Failed to get files', details: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const formData = await request.formData();
        const conversationId = formData.get('conversationId');
        const sessionId = formData.get('sessionId');
        const files = formData.getAll('files');

        if (!sessionId) {
            return Response.json({ error: 'sessionId is required' }, { status: 400 });
        }

        const normalizedConversationId = conversationId && conversationId !== 'null' && conversationId !== 'undefined'
            ? conversationId
            : null;

        if (!files || files.length === 0) {
            return Response.json({ error: 'No files uploaded' }, { status: 400 });
        }

        const uploadedFiles = [];
        const errors = [];
        const tableName = getTableName('uploaded_files'); // Uses schema from DB_SNOWFLAKE_SCHEMA env var

        // Ensure table exists
        try {
            await initializeFilesTable();
        } catch (initErr) {
            console.log('[Backend] Table check completed (may already exist)');
        }

        for (const file of files) {
            if (!(file instanceof File)) continue;

            if (file.size > MAX_FILE_SIZE) {
                errors.push(`File ${file.name} is too large. Maximum size is 10MB.`);
                continue;
            }

            console.log(`[Backend] Processing file: ${file.name}, size: ${file.size}`);
            const fileId = uuidv4();
            let fileContent = '';

            try {
                const arrayBuffer = await file.arrayBuffer();
                fileContent = Buffer.from(arrayBuffer).toString('utf-8');
                console.log(`[Backend] File content length: ${fileContent.length} characters`);
            } catch (err) {
                console.warn(`[Backend] Could not read file ${file.name} as text:`, err.message);
                fileContent = `[Binary file: ${file.name}]`;
            }

            const escapedFileId = escapeSQLString(fileId);
            const escapedConversationId = normalizedConversationId ? escapeSQLString(normalizedConversationId) : null;
            const escapedSessionId = escapeSQLString(sessionId);
            const escapedFilename = escapeSQLString(file.name);
            const escapedMimeType = escapeSQLString(file.type || 'application/octet-stream');

            const base64Content = Buffer.from(fileContent, 'utf-8').toString('base64');
            const MAX_CHUNK_SIZE = 300000;
            const needsChunking = base64Content.length > MAX_CHUNK_SIZE;

            try {
                if (needsChunking) {
                    console.log(`[Backend] File ${file.name} is large, using chunked storage`);

                    const chunks = [];
                    for (let i = 0; i < base64Content.length; i += MAX_CHUNK_SIZE) {
                        chunks.push(base64Content.substring(i, i + MAX_CHUNK_SIZE));
                    }

                    const metadataJson = JSON.stringify({
                        encoding: 'base64',
                        originalSize: fileContent.length,
                        chunked: true
                    });
                    const escapedMetadataJson = metadataJson.replace(/'/g, "''");

                    const metadataSQL = `
                        INSERT INTO ${tableName} (
                            file_id, conversation_id, session_id, filename, 
                            file_content, file_size, mime_type, uploaded_at,
                            is_chunked, chunk_count
                        )
                        SELECT 
                            '${escapedFileId}', 
                            ${escapedConversationId ? `'${escapedConversationId}'` : 'NULL'}, 
                            '${escapedSessionId}', 
                            '${escapedFilename}', 
                            PARSE_JSON('${escapedMetadataJson}'), 
                            ${file.size}, 
                            '${escapedMimeType}', 
                            CURRENT_TIMESTAMP(),
                            TRUE, 
                            ${chunks.length}
                    `;

                    await executeSnowflakeSQL(metadataSQL);

                    const chunksTable = getTableName('uploaded_file_chunks'); // Uses schema from DB_SNOWFLAKE_SCHEMA env var
                    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                        const chunk = chunks[chunkIndex];
                        const chunkJson = JSON.stringify({
                            content: chunk,
                            index: chunkIndex
                        });
                        const escapedChunkJson = chunkJson.replace(/'/g, "''");

                        const chunkSQL = `
                            INSERT INTO ${chunksTable} (
                                file_id, chunk_index, chunk_content
                            )
                            SELECT 
                                '${escapedFileId}', 
                                ${chunkIndex}, 
                                PARSE_JSON('${escapedChunkJson}')
                        `;

                        await executeSnowflakeSQL(chunkSQL);
                    }
                } else {
                    const fileJson = JSON.stringify({
                        content: base64Content,
                        encoding: 'base64',
                        originalSize: fileContent.length
                    });
                    const escapedFileJson = fileJson.replace(/'/g, "''");

                    const sql = `
                        INSERT INTO ${tableName} (
                            file_id, conversation_id, session_id, filename, 
                            file_content, file_size, mime_type, uploaded_at,
                            is_chunked, chunk_count
                        )
                        SELECT 
                            '${escapedFileId}', 
                            ${escapedConversationId ? `'${escapedConversationId}'` : 'NULL'}, 
                            '${escapedSessionId}', 
                            '${escapedFilename}', 
                            PARSE_JSON('${escapedFileJson}'), 
                            ${file.size}, 
                            '${escapedMimeType}', 
                            CURRENT_TIMESTAMP(),
                            FALSE, 
                            0
                    `;

                    await executeSnowflakeSQL(sql);
                }

                const verifySQL = `SELECT file_id FROM ${tableName} WHERE file_id = '${escapedFileId}'`;
                const verifyResult = await executeSnowflakeSQL(verifySQL);
                if (verifyResult.data && verifyResult.data.length > 0) {
                    uploadedFiles.push({
                        id: fileId,
                        filename: file.name,
                        size: file.size,
                        mimeType: file.type
                    });
                }
            } catch (sqlErr) {
                const errorMsg = `Failed to save file ${file.name}: ${sqlErr.message}`;
                console.error(`[Backend] ${errorMsg}`);
                errors.push(errorMsg);
            }
        }

        if (uploadedFiles.length === 0) {
            const errorDetails = errors.length > 0
                ? errors.join('; ')
                : 'Files were received but failed to save to database.';
            return Response.json({
                error: 'Failed to upload files',
                details: errorDetails,
                files: []
            }, { status: 500 });
        }

        return Response.json({ files: uploadedFiles });
    } catch (err) {
        console.error('[Backend] File upload error:', err.message);
        return Response.json({ error: 'Failed to upload files', details: err.message }, { status: 500 });
    }
}

