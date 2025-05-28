import { DataSource } from "typeorm";

import client from "../../../salt";


export const initializeVectorExtension = async (dataSource: DataSource): Promise<void> => {
    try {
        await dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
        client.logger.info('[DATABASE] Vector extension initialized successfully');

        const result = await dataSource.query(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        );

        if (result[0].exists) {
            client.logger.info('[DATABASE] Vector extension is active and ready for use');
        } else {
            client.logger.warn('[DATABASE] Vector extension was installed but may not be active');
        }

        try {
            await dataSource.query("SELECT '[1,2,3]'::vector");
            client.logger.debug('[DATABASE] Vector type conversion test passed');
        } catch (testError) {
            client.logger.warn(`[DATABASE] Vector type test failed: ${testError}`);
        }

    } catch (error) {
        client.logger.error(`[DATABASE] Failed to initialize vector extension: ${error}`);
        client.logger.warn('[DATABASE] RAG functionality will use fallback similarity search');
    }
};