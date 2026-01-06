/**
 * GET /api/files/:fileId/content
 * Get file content
 */

import { escapeSQLString, executeSnowflakeSQL, getTableName } from '@/lib/snowflake';

export async function GET(request, { params }) {
    try {
        const { fileId } = params;
        const escapedFileId = escapeSQLString(fileId);
        const tableName = getTableName('uploaded_files'); // Uses schema from DB_SNOWFLAKE_SCHEMA env var

        const fileSQL = `
            SELECT file_content, is_chunked, chunk_count
            FROM ${tableName}
            WHERE file_id = '${escapedFileId}'
        `;

        const fileResult = await executeSnowflakeSQL(fileSQL);
        if (!fileResult.data || fileResult.data.length === 0) {
            return Response.json({ error: 'File not found' }, { status: 404 });
        }

        const fileRow = fileResult.data[0];
        const fileContent = fileRow[0];
        const isChunked = fileRow[1] === true || fileRow[1] === 'TRUE';
        const chunkCount = fileRow[2] || 0;

        let decodedContent = '';

        if (isChunked && chunkCount > 0) {
            const chunksTable = getTableName('uploaded_file_chunks'); // Uses schema from DB_SNOWFLAKE_SCHEMA env var
            const chunksSQL = `
                SELECT chunk_content
                FROM ${chunksTable}
                WHERE file_id = '${escapedFileId}'
                ORDER BY chunk_index ASC
            `;

            const chunksResult = await executeSnowflakeSQL(chunksSQL);
            if (!chunksResult.data || chunksResult.data.length !== chunkCount) {
                throw new Error(`Expected ${chunkCount} chunks but found ${chunksResult.data?.length || 0}`);
            }

            const base64Chunks = chunksResult.data.map(row => {
                const chunkContent = row[0];
                const chunk = typeof chunkContent === 'string' ? JSON.parse(chunkContent) : chunkContent;
                return chunk.content || '';
            });

            const fullBase64 = base64Chunks.join('');
            decodedContent = Buffer.from(fullBase64, 'base64').toString('utf-8');
        } else {
            const content = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
            let base64Content = content.content || '';
            if (content.encoding === 'base64' && typeof base64Content === 'string') {
                decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');
            } else {
                decodedContent = base64Content;
            }
        }

        return Response.json({ content: decodedContent });
    } catch (err) {
        console.error('Error getting file content:', err.message);
        return Response.json({ error: 'Failed to get file content', details: err.message }, { status: 500 });
    }
}

