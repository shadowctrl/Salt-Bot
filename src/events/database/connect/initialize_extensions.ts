import { DataSource } from "typeorm";

import client from "../../../salt";


export const initializeVectorExtension = async (dataSource: DataSource): Promise<boolean> => {
    try {
        const extensionCheck = await dataSource.query(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        );

        if (extensionCheck[0].exists) {
            client.logger.info('[DATABASE] Vector extension is already active');
            return true;
        }

        try {
            await dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
            client.logger.info('[DATABASE] Vector extension created successfully');

            const verifyResult = await dataSource.query(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
            );

            if (verifyResult[0].exists) {
                client.logger.info('[DATABASE] Vector extension is active and ready for use');

                try {
                    await dataSource.query("SELECT '[1,2,3]'::vector");
                    client.logger.debug('[DATABASE] Vector type conversion test passed');
                    return true;
                } catch (testError) {
                    client.logger.warn(`[DATABASE] Vector type test failed: ${testError}`);
                    return false;
                }
            } else {
                client.logger.warn('[DATABASE] Vector extension installation verification failed');
                return false;
            }

        } catch (createError: any) {
            if (createError.message.includes('permission denied') ||
                createError.message.includes('must be owner')) {
                client.logger.error('[DATABASE] Insufficient permissions to create vector extension. Contact your database administrator.');
            } else if (createError.message.includes('could not open extension control file') ||
                createError.message.includes('extension "vector" is not available')) {
                client.logger.error('[DATABASE] pgvector extension is not available in this database instance. Please install pgvector or use a database service that supports it.');
            } else {
                client.logger.error(`[DATABASE] Failed to create vector extension: ${createError.message}`);
            }
            return false;
        }

    } catch (error: any) {
        client.logger.error(`[DATABASE] Error during vector extension initialization: ${error.message}`);
        client.logger.warn('[DATABASE] RAG functionality will use fallback similarity search without vector operations');
        return false;
    }
};