import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	attributeMutationOperations,
	dataMutationOperations,
	executeOperation,
	isExecutionDataArray,
} from './Actions';
import { getMatrix42ApiSession, toExecutionData } from './GenericFunctions';
import { matrix42Methods } from './LoadOptions';

export class Matrix42Pro implements INodeType {
	methods = matrix42Methods;

	description: INodeTypeDescription = {
		displayName: 'Matrix42 Pro',
		name: 'matrix42Pro',
		icon: {
			light: 'file:matrix42pro.svg',
			dark: 'file:matrix42pro.dark.svg',
		},
		group: ['transform'],
		version: 1,
		usableAsTool: {
			replacements: {
				description:
					'Full Matrix42 Pro workflow/admin node. For AI agents, prefer Matrix42 Pro AI Tool for read-only searches and lookups, and keep writes behind human review.',
			},
		},
		subtitle:
			'={{$parameter["resource"] + ": " + $parameter["operation"].replace(/^./, $parameter["operation"][0].toUpperCase())}}',
		description: 'Work with Matrix42 Pro and Efecte Service Management data cards',
		defaults: {
			name: 'Matrix42 Pro',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'matrix42ProApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: '={{$credentials.instanceUrl.replace(/\\/$/, "")}}',
			headers: {
				Accept: 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Attachment',
						value: 'attachment',
					},
					{
						name: 'Attribute',
						value: 'attribute',
					},
					{
						name: 'Data Card',
						value: 'dataCard',
					},
					{
						name: 'Template',
						value: 'template',
					},
					{
						name: 'Utility',
						value: 'utility',
					},
				],
				default: 'dataCard',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['template'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get template details, including attributes and allowed folders',
						action: 'Get a template',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get many available templates',
						action: 'Get many templates',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['dataCard'],
					},
				},
				options: [
					{
						name: 'Bulk Import',
						value: 'bulkImport',
						description: 'Import multiple data cards in one synchronous request',
						action: 'Bulk import data cards',
					},
					{
						name: 'Create',
						value: 'create',
						description: 'Create a data card',
						action: 'Create a data card',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a data card',
						action: 'Delete a data card',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a data card by ID',
						action: 'Get a data card',
					},
					{
						name: 'List',
						value: 'list',
						description: 'List data cards by template code',
						action: 'List data cards',
					},
					{
						name: 'Stream',
						value: 'stream',
						description: 'Stream all matching data cards',
						action: 'Stream data cards',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update a data card',
						action: 'Update a data card',
					},
				],
				default: 'list',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['attribute'],
					},
				},
				options: [
					{
						name: 'Add Value',
						value: 'add',
						description: 'Add a value to a multi-value or empty attribute',
						action: 'Add an attribute value',
					},
					{
						name: 'Clear',
						value: 'delete',
						description: 'Clear an attribute value',
						action: 'Clear an attribute',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a data card attribute value',
						action: 'Get an attribute',
					},
					{
						name: 'Replace',
						value: 'update',
						description: 'Replace an attribute value',
						action: 'Replace an attribute',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['attachment'],
					},
				},
				options: [
					{
						name: 'Download',
						value: 'download',
						description: 'Download a file from an external-reference attribute',
						action: 'Download an attachment',
					},
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a file to an external-reference attribute',
						action: 'Upload an attachment',
					},
				],
				default: 'download',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['utility'],
					},
				},
				options: [
					{
						name: 'Echo',
						value: 'echo',
						description: 'Call the unauthenticated echo endpoint',
						action: 'Call echo',
					},
					{
						name: 'Echo With JWT',
						value: 'echoJwt',
						description: 'Call the authenticated echo endpoint',
						action: 'Call authenticated echo',
					},
				],
				default: 'echoJwt',
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
				displayOptions: {
					show: {
						resource: ['attachment', 'attribute', 'dataCard', 'template'],
					},
					hide: {
						resource: ['template'],
						operation: ['getAll'],
					},
				},
				description: 'Template code from Matrix42 Pro, for example incident or service_request',
			},
			{
				displayName: 'Data Card ID',
				name: 'dataCardId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['attachment', 'attribute'],
					},
				},
				description: 'ID of the data card',
			},
			{
				displayName: 'Data Card ID',
				name: 'dataCardId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: ['delete', 'get', 'update'],
					},
				},
				description: 'ID of the data card',
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
						resource: ['attribute'],
					},
				},
				description: 'Code of the Matrix42 Pro attribute',
			},
			{
				displayName: 'File Attribute Code',
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
						placeholder: 'Select a file attribute...',
						typeOptions: {
							searchListMethod: 'searchFileAttributes',
							searchable: true,
						},
					},
					{
						displayName: 'By Code',
						name: 'code',
						type: 'string',
						placeholder: 'attachments',
					},
				],
				displayOptions: {
					show: {
						resource: ['attachment'],
					},
				},
				description: 'Code of the Matrix42 Pro external-reference file attribute',
			},
			{
				displayName: 'Folder Code',
				name: 'folderCode',
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
						placeholder: 'Select a folder...',
						typeOptions: {
							searchListMethod: 'searchAllowedFolders',
							searchable: true,
						},
					},
					{
						displayName: 'By Code',
						name: 'code',
						type: 'string',
						placeholder: 'incident_management',
					},
				],
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: ['create'],
					},
				},
				description: 'Folder code where the new data card should be created',
			},
			{
				displayName: 'Folder Code',
				name: 'folderCode',
				type: 'resourceLocator',
				default: {
					mode: 'list',
					value: '',
				},
				typeOptions: {
					loadOptionsDependsOn: ['templateCode.value'],
				},
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a folder...',
						typeOptions: {
							searchListMethod: 'searchAllowedFolders',
							searchable: true,
						},
					},
					{
						displayName: 'By Code',
						name: 'code',
						type: 'string',
						placeholder: 'incident_management',
					},
				],
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: ['update'],
					},
				},
				description: 'Optional folder code to move the data card while updating it',
			},
			{
				displayName: 'Data Input',
				name: 'dataMode',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: dataMutationOperations,
					},
				},
				options: [
					{
						name: 'Field Builder',
						value: 'fields',
					},
					{
						name: 'Raw JSON',
						value: 'json',
					},
				],
				default: 'fields',
				description: 'How to provide the data card attribute payload',
			},
			{
				displayName: 'Fields',
				name: 'fields',
				placeholder: 'Add Field Value',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: dataMutationOperations,
						dataMode: ['fields'],
					},
				},
				options: [
					{
						name: 'field',
						displayName: 'Field Value',
						values: [
							{
								displayName: 'Attribute Code',
								name: 'attributeCode',
								type: 'string',
								default: '',
								required: true,
								placeholder: 'subject',
							},
							{
								displayName: 'External Location',
								name: 'location',
								type: 'string',
								default: '',
								description: 'Location for external-reference attributes',
							},
							{
								displayName: 'External Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Name for external-reference attributes',
							},
							{
								displayName: 'Referenced Data Card ID',
								name: 'referencedDataCardId',
								type: 'string',
								default: '',
								description: 'Data card ID for reference attributes',
							},
							{
								displayName: 'Static Code',
								name: 'code',
								type: 'string',
								default: '',
								description: 'Optional code for static-value attributes',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description:
									'Value for string, number, date, static value, or worklog fields. Repeat the same attribute code to send multiple values.',
							},
							{
								displayName: 'Value Type',
								name: 'valueType',
								type: 'options',
								options: [
									{
										name: 'Date or DateTime',
										value: 'date',
									},
									{
										name: 'External Reference',
										value: 'externalReference',
									},
									{
										name: 'Number',
										value: 'number',
									},
									{
										name: 'Reference',
										value: 'reference',
									},
									{
										name: 'Static Value',
										value: 'staticValue',
									},
									{
										name: 'String',
										value: 'string',
									},
									{
										name: 'Worklog Comment',
										value: 'worklog',
									},
								],
								default: 'string',
							},
						],
					},
				],
			},
			{
				displayName: 'Raw Data JSON',
				name: 'rawData',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: dataMutationOperations,
						dataMode: ['json'],
					},
				},
				description: 'Raw value for the request data object',
			},
			{
				displayName: 'Options',
				name: 'mutationOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: dataMutationOperations,
					},
				},
				options: [
					{
						displayName: 'Create Empty References',
						name: 'createEmptyReferences',
						type: 'boolean',
						default: false,
						description:
							'Whether to create new references if a reference value does not exist in the system',
					},
					{
						displayName: 'Return Full Data Cards',
						name: 'dataCards',
						type: 'boolean',
						default: false,
						description: 'Whether to return full data cards instead of simple info elements',
					},
				],
			},
			{
				displayName: 'List Options',
				name: 'listOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: ['list'],
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
						displayName: 'Filter ID',
						name: 'filterId',
						type: 'number',
						default: 0,
						description:
							'Pagination cursor. The API returns data cards with IDs lower than this value.',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: {
							minValue: 1,
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
							'Comma-separated attribute codes to return. Leave empty to use the API default.',
					},
				],
			},
			{
				displayName: 'Stream Options',
				name: 'streamOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: ['stream'],
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
							'Comma-separated attribute codes to return. Leave empty to return all attributes.',
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
						resource: ['dataCard'],
						operation: ['get'],
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
							'Comma-separated attribute codes to return. Leave empty to return all attributes.',
					},
				],
			},
			{
				displayName: 'Data Cards JSON',
				name: 'bulkImportData',
				type: 'json',
				default:
					'[\n  {\n    "folderCode": "incident_management",\n    "data": {\n      "subject": {\n        "values": [\n          { "value": "Created from n8n" }\n        ]\n      }\n    }\n  }\n]',
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: ['bulkImport'],
					},
				},
				description: 'Array of Matrix42 Pro data card create/update request objects',
			},
			{
				displayName: 'Attribute Values',
				name: 'attributeValues',
				placeholder: 'Add Value',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				displayOptions: {
					show: {
						resource: ['attribute'],
						operation: attributeMutationOperations,
					},
				},
				options: [
					{
						name: 'value',
						displayName: 'Value',
						values: [
							{
								displayName: 'External Location',
								name: 'location',
								type: 'string',
								default: '',
								description: 'Location for external-reference attributes',
							},
							{
								displayName: 'External Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Name for external-reference attributes',
							},
							{
								displayName: 'Referenced Data Card ID',
								name: 'referencedDataCardId',
								type: 'string',
								default: '',
								description: 'Data card ID for reference attributes',
							},
							{
								displayName: 'Static Code (Manual)',
								name: 'codeManual',
								type: 'string',
								default: '',
								description:
									'Manual static value code fallback if the selected attribute does not expose a static-value list',
							},
							{
								displayName: 'Static Value Name or ID',
								name: 'code',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getStaticValues',
									loadOptionsDependsOn: ['templateCode.value', 'attributeCode.value'],
								},
								default: '',
								description:
									'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Value for string, number, date, static value, or worklog fields',
							},
							{
								displayName: 'Value Type',
								name: 'valueType',
								type: 'options',
								options: [
									{
										name: 'Date or DateTime',
										value: 'date',
									},
									{
										name: 'External Reference',
										value: 'externalReference',
									},
									{
										name: 'Number',
										value: 'number',
									},
									{
										name: 'Reference',
										value: 'reference',
									},
									{
										name: 'Static Value',
										value: 'staticValue',
									},
									{
										name: 'String',
										value: 'string',
									},
									{
										name: 'Worklog Comment',
										value: 'worklog',
									},
								],
								default: 'string',
							},
						],
					},
				],
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						resource: ['attachment'],
						operation: ['upload'],
					},
				},
				description: 'Name of the input binary property containing the file to upload',
			},
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['attachment'],
						operation: ['upload'],
					},
				},
				description: 'File name to send. If empty, the binary file name is used.',
			},
			{
				displayName: 'File Location',
				name: 'fileLocation',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['attachment'],
						operation: ['download'],
					},
				},
				placeholder: '20210512_01',
				description: 'Internal external-reference file location returned by Matrix42 Pro',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: 'n8n',
				displayOptions: {
					show: {
						resource: ['utility'],
					},
				},
				description: 'Message sent to the Matrix42 Pro echo endpoint',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const session = await getMatrix42ApiSession.call(this);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const result = await executeOperation.call(this, resource, operation, session, itemIndex);

				if (Array.isArray(result)) {
					if (isExecutionDataArray(result)) {
						returnData.push(...result);
					} else {
						returnData.push(...toExecutionData.call(this, result, itemIndex));
					}
				} else {
					returnData.push(...toExecutionData.call(this, result, itemIndex));
				}
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
