/**
 * DELETE /api/files/:fileId
 * Delete a file
 */

import { escapeSQLString, executeSnowflakeSQL, getTableName } from '@/lib/snowflake';

export async function DELETE(request, { params }) {
    try {
        const { fileId } = params;
        const escapedFileId = escapeSQLString(fileId);
        const chunksTable = getTableName('uploaded_file_chunks'); // Uses schema from DB_SNOWFLAKE_SCHEMA env var
        const filesTable = getTableName('uploaded_files'); // Uses schema from DB_SNOWFLAKE_SCHEMA env var

        // Delete chunks first (if any)
        const deleteChunksSQL = `DELETE FROM ${chunksTable} WHERE file_id = '${escapedFileId}'`;
        await executeSnowflakeSQL(deleteChunksSQL);

        // Delete file record
        const sql = `DELETE FROM ${filesTable} WHERE file_id = '${escapedFileId}'`;
        await executeSnowflakeSQL(sql);

        return Response.json({ success: true });
    } catch (err) {
        console.error('Error deleting file:', err.message);
        return Response.json({ error: 'Failed to delete file', details: err.message }, { status: 500 });
    }
}

