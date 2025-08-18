import { OpenAIFunction } from '../../types';

/**
 * Creates tools for ticket management with dynamic category support
 * @param availableCategories - Array of available ticket categories with id and name
 * @returns Array containing the tool definition for creating tickets
 */
export const createDynamicTicketTool = (availableCategories: Array<{ id: string; name: string }>): Array<OpenAIFunction> => {
	const categoryNames = availableCategories.map((cat) => cat.name);
	return [
		{
			type: 'function',
			function: {
				name: 'create_ticket',
				description: "Create a new support ticket for the user when they need human assistance, have complex issues, technical problems, or are not satisfied with the AI response. Use this tool when the user's question requires staff intervention.",
				parameters: {
					type: 'object',
					properties: {
						ticket_category: {
							type: 'string',
							description: "The ticket category to create the ticket in. Choose the most appropriate category based on the user's issue.",
							enum: categoryNames,
						},
						message: {
							type: 'string',
							description: 'Reply message to the user summarizing their issue and confirming the ticket creation. Include any relevant details from the conversation.',
						},
					},
					required: ['ticket_category', 'message'],
					additionalProperties: false,
				},
			},
		},
	];
};
