import discord from "discord.js";

import { RAG } from "../../../core/ai";
import { Embedding } from "../../../core/ai";
import { EmbedTemplate } from "../../../core/embed/template";
import { RagRepository } from "../../../events/database/repo/rag_data";


export const handleUploadRag = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ragRepo: RagRepository
): Promise<void> => {
    try {
        const hasExistingData = await ragRepo.hasRagData(interaction.guildId!);
        if (hasExistingData) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).warning("Knowledge data already exists for this server.")
                        .setDescription("You can only have one set of knowledge data. Please delete the existing data first using `/chatbot delete_rag` before uploading new data.")
                ]
            });
            return;
        }

        const file = interaction.options.getAttachment("file");
        if (!file) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("No file was provided.")]
            });
            return;
        }

        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        if (!fileExtension || !['txt', 'md'].includes(fileExtension)) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("Invalid file type.")
                        .setDescription("Please upload a text (.txt) or Markdown (.md) file.")
                ]
            });
            return;
        }

        // Validate file size (max 1MB)
        if (file.size > 1024 * 1024) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("File too large.")
                        .setDescription("Maximum file size is 1MB.")
                ]
            });
            return;
        }

        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Processing Knowledge Data")
                    .setDescription("Downloading and processing your knowledge data. This may take a moment...")
                    .setColor("Blue")
            ]
        });

        const response = await fetch(file.url);
        if (!response.ok) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("Failed to download file.")
                        .setDescription(`HTTP error: ${response.status}`)
                ]
            });
            return;
        }

        const textContent = await response.text();
        if (!textContent || textContent.trim().length === 0) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("The file is empty.")
                        .setDescription("Please upload a file with content.")
                ]
            });
            return;
        }

        const description = interaction.options.getString("description");
        const embedding = new Embedding();
        const rag = new RAG(embedding);

        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Generating Embeddings")
                    .setDescription("Creating semantic chunks and generating embeddings...")
                    .setColor("Blue")
            ]
        });

        const processedDocs = await rag.processText(
            textContent,
            { name: file.name, type: fileExtension as 'txt' | 'md' },
            {
                chunkSize: 500,
                chunkOverlap: 50,
                deduplicate: true
            }
        );

        if (processedDocs.length === 0) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("Failed to process document.")
                        .setDescription("No chunks were generated. The file may be too short or contain unsupported content.")
                ]
            });
            return;
        }

        const storedDocument = await ragRepo.storeRagData(
            interaction.guildId!,
            file.name,
            fileExtension,
            description,
            processedDocs
        );

        if (!storedDocument) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("Failed to store knowledge data.")
                        .setDescription("There was an error saving your data to the database.")
                ]
            });
            return;
        }

        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Knowledge Data Added Successfully!")
                    .setDescription(`Your knowledge base has been processed and added to the chatbot.`)
                    .addFields(
                        { name: "File", value: file.name, inline: true },
                        { name: "Chunks Created", value: storedDocument.chunkCount.toString(), inline: true },
                        { name: "Size", value: `${Math.round(file.size / 1024)} KB`, inline: true }
                    )
            ]
        });

        client.logger.info(`[CHATBOT_RAG] Added RAG data for guild ${interaction.guildId}: ${file.name} (${storedDocument.chunkCount} chunks)`);
    } catch (error) {
        client.logger.error(`[CHATBOT_RAG] Error uploading RAG data: ${error}`);
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).error("An error occurred while processing your knowledge data.")
                    .setDescription(`Error: ${error instanceof Error ? error.message : String(error)}`)
            ]
        });
    }
};