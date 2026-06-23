import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { aiToolOperationOptions, executeAiToolOperation } from './AiToolActions';
import { getMatrix42ApiSession, toExecutionData } from './GenericFunctions';
import { matrix42Methods } from './LoadOptions';

export class Matrix42ProAiTool implements INodeType {
	methods = matrix42Methods;

	description: INodeTypeDescription = {
		displayName: 'Matrix42 Pro AI Tool',
		name: 'matrix42ProAiTool',
		icon: {
			light: 'file:matrix42pro.svg',
			dark: 'file:matrix42pro.dark.svg',
		},
		group: ['transform'],
		version: 1,
		usableAsTool: {
			replacements: {
				description:
					'Read-only Matrix42 Pro tool for AI agents. Search data cards and inspect templates, cards, and attributes without creating, updating, deleting, or uploading anything.',
			},
		},
		subtitle:
			'={{$parameter["operation"].replace(/([A-Z])/g, " $1").replace(/^./, $parameter["operation"][0].toUpperCase())}}',
		description: 'Read-only Matrix42 Pro search and lookup tool for n8n AI agents',
		defaults: {
			name: 'Matrix42 Pro AI Tool',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'matrix42ProApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [...aiToolOperationOptions],
				default: 'searchDataCards',
			},
			{
				displayName: 'Template Code',
				name: 'templateCode',
				type: 'resourceLocator',
				default: {
					mode: 'list',
					value: '',
				},
				required: true,
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a template...',
						typeOptions: {
							searchListMethod: 'searchTemplates',
							searchable: true,
						},
					},
					{
						displayName: 'By Code',
						name: 'code',
						type: 'string',
						placeholder: 'incident',
					},
				],
				description: 'Matrix42 Pro template code to search or inspect',
			},
			{
				displayName: 'Data Card ID',
				name: 'dataCardId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['getAttribute', 'getDataCard'],
					},
				},
				description: 'ID of the Matrix42 Pro data card',
			},
			{
				displayName: 'Attribute Code',
				name: 'attributeCode',
				type: 'resourceLocator',
				default: {
					mode: 'list',
					value: '',
				},
				required: true,
				typeOptions: {
					loadOptionsDependsOn: ['templateCode.value'],
				},
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select an attribute...',
						typeOptions: {
							searchListMethod: 'searchAttributes',
							searchable: true,
						},
					},
					{
						displayName: 'By Code',
						name: 'code',
						type: 'string',
						placeholder: 'status',
					},
				],
				displayOptions: {
					show: {
						operation: ['getAttribute'],
					},
				},
				description: 'Code of the Matrix42 Pro attribute to inspect',
			},
			{
				displayName: 'Search Options',
				name: 'searchOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['searchDataCards'],
					},
				},
				options: [
					{
						displayName: 'Filter',
						name: 'filter',
						type: 'string',
						default: '',
						placeholder: "$status$ = '02 - Solving'",
						description: 'EQL filter using Matrix42/Efecte attribute syntax',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 50,
						},
						default: 50,
						description: 'Max number of results to return',
					},
					{
						displayName: 'Return Full Data Cards',
						name: 'dataCards',
						type: 'boolean',
						default: false,
						description: 'Whether to return full data cards instead of simple info elements',
					},
					{
						displayName: 'Selected Attributes',
						name: 'selectedAttributes',
						type: 'string',
						default: '',
						placeholder: 'subject,status,priority',
						description:
							'Comma-separated attribute codes to return. Keep this narrow for AI context windows.',
					},
				],
			},
			{
				displayName: 'Get Options',
				name: 'getOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['getDataCard'],
					},
				},
				options: [
					{
						displayName: 'Selected Attributes',
						name: 'selectedAttributes',
						type: 'string',
						default: '',
						placeholder: 'subject,status,priority',
						description:
							'Comma-separated attribute codes to return. Keep this narrow for AI context windows.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const session = await getMatrix42ApiSession.call(this);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const result = await executeAiToolOperation.call(this, operation, session, itemIndex);

				returnData.push(...toExecutionData.call(this, result, itemIndex));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push(
						...toExecutionData.call(
							this,
							{
								error: error instanceof Error ? error.message : 'Unknown error',
							},
							itemIndex,
						),
					);
					continue;
				}

				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex,
				});
			}
		}

		return [returnData];
	}
}
