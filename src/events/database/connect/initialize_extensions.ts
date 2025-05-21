import { DataSource } from "typeorm";
import client from "../../../salt";

export const initializeVectorExtension = async (dataSource: DataSource): Promise<void> => {
    try {
        await dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
        client.logger.info('[DATABASE] Vector extension initialized successfully');
    } catch (error) {
        client.logger.error(`[DATABASE] Failed to initialize vector extension: ${error}`);
        throw error;
    }
};