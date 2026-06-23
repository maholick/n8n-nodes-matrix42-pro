import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	buildAttributeValues,
	buildDataCardData,
	buildDataCardQuery,
	cleanDataObject,
	encodePathSegment,
	extractResponseItems,
	getDataCardId,
	getMatrix42ApiSession,
	matrix42ApiRequest,
	parseJsonParameter,
	toExecutionData,
} from './GenericFunctions';

const dataCardOperations = ['bulkImport', 'create', 'delete', 'get', 'list', 'stream', 'update'];
const dataMutationOperations = ['create', 'update'];
const attributeMutationOperations = ['add', 'update'];
const attachmentOperations = ['download', 'upload'];

export class Matrix42Pro implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Matrix42 Pro',
		name: 'matrix42Pro',
		icon: {
			light: 'file:matrix42pro.svg',
			dark: 'file:matrix42pro.dark.svg',
		},
		group: ['transform'],
		version: 1,
		usableAsTool: true,
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
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['attachment', 'attribute', 'dataCard', 'template'],
					},
					hide: {
						resource: ['template'],
						operation: ['getAll'],
					},
				},
				placeholder: 'incident',
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
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['attachment', 'attribute'],
					},
				},
				placeholder: 'attachments',
				description: 'Code of the Matrix42 Pro attribute',
			},
			{
				displayName: 'Folder Code',
				name: 'folderCode',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: ['create'],
					},
				},
				placeholder: 'incident_management',
				description: 'Folder code where the new data card should be created',
			},
			{
				displayName: 'Folder Code',
				name: 'folderCode',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['dataCard'],
						operation: ['update'],
					},
				},
				placeholder: 'incident_management',
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

function isExecutionDataArray(
	data: Array<IDataObject | INodeExecutionData>,
): data is INodeExecutionData[] {
	return data.some((item) => 'binary' in item || 'pairedItem' in item);
}

async function executeOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	session: Awaited<ReturnType<typeof getMatrix42ApiSession>>,
	itemIndex: number,
): Promise<IDataObject | IDataObject[] | INodeExecutionData[]> {
	if (resource === 'template') {
		return await executeTemplateOperation.call(this, operation, session, itemIndex);
	}

	if (resource === 'dataCard') {
		return await executeDataCardOperation.call(this, operation, session, itemIndex);
	}

	if (resource === 'attribute') {
		return await executeAttributeOperation.call(this, operation, session, itemIndex);
	}

	if (resource === 'attachment') {
		return await executeAttachmentOperation.call(this, operation, session, itemIndex);
	}

	if (resource === 'utility') {
		return await executeUtilityOperation.call(this, operation, session, itemIndex);
	}

	throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`, {
		itemIndex,
	});
}

async function executeTemplateOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Awaited<ReturnType<typeof getMatrix42ApiSession>>,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	if (operation === 'getAll') {
		const response = await matrix42ApiRequest.call(
			this,
			session,
			'GET',
			'/dc',
			undefined,
			undefined,
			itemIndex,
		);

		return extractResponseItems(response);
	}

	const templateCode = this.getNodeParameter('templateCode', itemIndex) as string;
	const response = await matrix42ApiRequest.call(
		this,
		session,
		'GET',
		`/dc/${encodeURIComponent(templateCode)}`,
		undefined,
		undefined,
		itemIndex,
	);

	return extractResponseItems(response);
}

async function executeDataCardOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Awaited<ReturnType<typeof getMatrix42ApiSession>>,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	if (!dataCardOperations.includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unsupported data card operation: ${operation}`, {
			itemIndex,
		});
	}

	const templateCode = this.getNodeParameter('templateCode', itemIndex) as string;
	const encodedTemplateCode = encodeURIComponent(templateCode);

	if (operation === 'bulkImport') {
		const bulkImportData = parseJsonParameter(
			this.getNodeParameter('bulkImportData', itemIndex),
			'Data Cards JSON',
			this.getNode(),
		);

		if (!Array.isArray(bulkImportData)) {
			throw new NodeOperationError(this.getNode(), 'Data Cards JSON must be an array', {
				itemIndex,
			});
		}

		const response = await matrix42ApiRequest.call(
			this,
			session,
			'PUT',
			`/dc/${encodedTemplateCode}/data`,
			bulkImportData,
			undefined,
			itemIndex,
		);

		return extractResponseItems(response);
	}

	if (operation === 'create' || operation === 'update') {
		const data = getDataCardMutationData.call(this, operation, itemIndex);
		const mutationOptions = this.getNodeParameter('mutationOptions', itemIndex) as IDataObject;
		const qs = cleanDataObject({
			createEmptyReferences: mutationOptions.createEmptyReferences,
			dataCards: mutationOptions.dataCards,
		});
		const method = operation === 'create' ? 'POST' : 'PATCH';
		const dataCardId =
			operation === 'update' ? (this.getNodeParameter('dataCardId', itemIndex) as string) : '';
		const folderCode = this.getNodeParameter('folderCode', itemIndex) as string;
		const body = cleanDataObject({
			data,
			dataCardId,
			folderCode,
		}) as IDataObject;
		const endpoint =
			operation === 'create'
				? `/dc/${encodedTemplateCode}/data`
				: `/dc/${encodedTemplateCode}/data/${encodeURIComponent(dataCardId)}`;
		const response = await matrix42ApiRequest.call(
			this,
			session,
			method,
			endpoint,
			body,
			qs,
			itemIndex,
		);

		return extractResponseItems(response);
	}

	if (operation === 'delete') {
		const dataCardId = this.getNodeParameter('dataCardId', itemIndex) as string;

		await matrix42ApiRequest.call(
			this,
			session,
			'DELETE',
			`/dc/${encodedTemplateCode}/data/${encodeURIComponent(dataCardId)}`,
			undefined,
			undefined,
			itemIndex,
		);

		return {
			success: true,
			dataCardId,
		};
	}

	if (operation === 'get') {
		const dataCardId = this.getNodeParameter('dataCardId', itemIndex) as string;
		const getOptions = this.getNodeParameter('getOptions', itemIndex) as IDataObject;
		const qs = cleanDataObject({
			selectedAttributes: getOptions.selectedAttributes,
		});
		const response = await matrix42ApiRequest.call(
			this,
			session,
			'GET',
			`/dc/${encodedTemplateCode}/data/${encodeURIComponent(dataCardId)}`,
			undefined,
			qs,
			itemIndex,
		);

		return extractResponseItems(response);
	}

	if (operation === 'list') {
		return await listDataCards.call(this, session, encodedTemplateCode, itemIndex);
	}

	const streamOptions = this.getNodeParameter('streamOptions', itemIndex) as IDataObject;
	const response = await matrix42ApiRequest.call(
		this,
		session,
		'GET',
		`/dc/${encodedTemplateCode}/data/stream`,
		undefined,
		buildDataCardQuery(streamOptions),
		itemIndex,
	);

	return extractResponseItems(response);
}

function getDataCardMutationData(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): IDataObject {
	const dataMode = this.getNodeParameter('dataMode', itemIndex) as string;

	if (dataMode === 'json') {
		const rawData = parseJsonParameter(
			this.getNodeParameter('rawData', itemIndex),
			'Raw Data JSON',
			this.getNode(),
		);

		if (Array.isArray(rawData)) {
			throw new NodeOperationError(this.getNode(), 'Raw Data JSON must be an object', {
				itemIndex,
			});
		}

		return rawData;
	}

	const data = buildDataCardData(this.getNodeParameter('fields', itemIndex) as IDataObject);

	if (Object.keys(data).length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one field value is required', {
			description: `Add a field value or switch ${operation} to Raw JSON input.`,
			itemIndex,
		});
	}

	return data;
}

async function listDataCards(
	this: IExecuteFunctions,
	session: Awaited<ReturnType<typeof getMatrix42ApiSession>>,
	encodedTemplateCode: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const listOptions = this.getNodeParameter('listOptions', itemIndex) as IDataObject;
	const requestedLimit = Number(listOptions.limit || 50);
	const query = buildDataCardQuery(listOptions);
	const allDataCards: IDataObject[] = [];
	let nextFilterId = Number(query?.filterId ?? 0);

	while (allDataCards.length < requestedLimit) {
		const pageSize = Math.min(200, requestedLimit - allDataCards.length);
		const qs = cleanDataObject({
			...query,
			filterId: nextFilterId,
			limit: pageSize,
		});
		const response = await matrix42ApiRequest.call(
			this,
			session,
			'GET',
			`/dc/${encodedTemplateCode}/data`,
			undefined,
			qs,
			itemIndex,
		);
		const dataCards = extractResponseItems(response);
		const meta = (response as IDataObject).meta as IDataObject | undefined;

		allDataCards.push(
			...dataCards.map((dataCard) => ({
				...dataCard,
				_meta: meta,
			})),
		);

		const lastDataCard = dataCards[dataCards.length - 1];
		const lastDataCardId = lastDataCard ? getDataCardId(lastDataCard) : undefined;

		if (dataCards.length < pageSize || lastDataCardId === undefined) {
			break;
		}

		nextFilterId = Number(lastDataCardId);
	}

	return allDataCards.slice(0, requestedLimit);
}

async function executeAttributeOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Awaited<ReturnType<typeof getMatrix42ApiSession>>,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const templateCode = this.getNodeParameter('templateCode', itemIndex) as string;
	const dataCardId = this.getNodeParameter('dataCardId', itemIndex) as string;
	const attributeCode = this.getNodeParameter('attributeCode', itemIndex) as string;
	const endpoint = `/dc/${encodeURIComponent(templateCode)}/data/${encodeURIComponent(
		dataCardId,
	)}/${encodeURIComponent(attributeCode)}`;

	if (operation === 'get') {
		const response = await matrix42ApiRequest.call(
			this,
			session,
			'GET',
			endpoint,
			undefined,
			undefined,
			itemIndex,
		);

		return extractResponseItems(response);
	}

	if (operation === 'delete') {
		await matrix42ApiRequest.call(
			this,
			session,
			'DELETE',
			endpoint,
			undefined,
			undefined,
			itemIndex,
		);

		return {
			success: true,
			attributeCode,
			dataCardId,
		};
	}

	if (!attributeMutationOperations.includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unsupported attribute operation: ${operation}`, {
			itemIndex,
		});
	}

	const body = buildAttributeValues(
		this.getNodeParameter('attributeValues', itemIndex) as IDataObject,
	);
	const method = operation === 'update' ? 'PUT' : 'POST';
	const response = await matrix42ApiRequest.call(
		this,
		session,
		method,
		endpoint,
		body,
		undefined,
		itemIndex,
	);

	return extractResponseItems(response);
}

async function executeAttachmentOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Awaited<ReturnType<typeof getMatrix42ApiSession>>,
	itemIndex: number,
): Promise<IDataObject | IDataObject[] | INodeExecutionData[]> {
	if (!attachmentOperations.includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unsupported attachment operation: ${operation}`, {
			itemIndex,
		});
	}

	const templateCode = this.getNodeParameter('templateCode', itemIndex) as string;
	const dataCardId = this.getNodeParameter('dataCardId', itemIndex) as string;
	const attributeCode = this.getNodeParameter('attributeCode', itemIndex) as string;
	const endpoint = `/dc/${encodeURIComponent(templateCode)}/data/${encodeURIComponent(
		dataCardId,
	)}/${encodeURIComponent(attributeCode)}/file`;

	if (operation === 'upload') {
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
		const binaryData = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
		const binaryMetadata = this.getInputData()[itemIndex].binary?.[binaryPropertyName];
		const fileName =
			(this.getNodeParameter('fileName', itemIndex) as string) ||
			binaryMetadata?.fileName ||
			'upload.bin';
		const formData = new FormData();
		const fileBlob = new Blob([binaryData], {
			type: binaryMetadata?.mimeType || 'application/octet-stream',
		});

		formData.append('fileName', fileName);
		formData.append('fileUpload', fileBlob, fileName);

		const response = await matrix42ApiRequest.call(
			this,
			session,
			'POST',
			endpoint,
			undefined,
			undefined,
			itemIndex,
			{
				formData,
				json: false,
			},
		);

		return extractResponseItems(response);
	}

	const fileLocation = this.getNodeParameter('fileLocation', itemIndex) as string;
	const response = (await matrix42ApiRequest.call(
		this,
		session,
		'GET',
		`${endpoint}/${encodePathSegment(fileLocation)}`,
		undefined,
		undefined,
		itemIndex,
		{
			headers: {
				Accept: '*/*',
			},
			encoding: 'arraybuffer',
			json: false,
			returnFullResponse: true,
		},
	)) as IDataObject;
	const responseBody = response.body ?? response;
	const fileBuffer = Buffer.isBuffer(responseBody)
		? responseBody
		: responseBody instanceof ArrayBuffer
			? Buffer.from(responseBody)
			: Buffer.from(responseBody as string);
	const responseHeaders = response.headers as IDataObject | undefined;
	const mimeType =
		(responseHeaders?.['content-type'] as string | undefined) || 'application/octet-stream';
	const binaryData = await this.helpers.prepareBinaryData(fileBuffer, fileLocation, mimeType);

	return [
		{
			json: {
				fileName: fileLocation,
				mimeType,
			},
			binary: {
				data: binaryData,
			},
			pairedItem: {
				item: itemIndex,
			},
		},
	];
}

async function executeUtilityOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Awaited<ReturnType<typeof getMatrix42ApiSession>>,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const message = this.getNodeParameter('message', itemIndex) as string;
	const endpoint = operation === 'echo' ? '/echo' : '/echo/jwt';
	const response = await matrix42ApiRequest.call(
		this,
		session,
		'GET',
		endpoint,
		undefined,
		{
			message,
		},
		itemIndex,
	);

	return extractResponseItems(response);
}
