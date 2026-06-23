import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	buildAttributeValues,
	buildDataCardData,
	buildDataCardQuery,
	cleanDataObject,
	encodePathSegment,
	extractResponseItems,
	getDataCardId,
	getMatrix42ApiSession,
	getResourceLocatorValue,
	matrix42ApiRequest,
	parseJsonParameter,
} from './GenericFunctions';

export const dataCardOperations = [
	'bulkImport',
	'create',
	'delete',
	'get',
	'list',
	'stream',
	'update',
];
export const dataMutationOperations = ['create', 'update'];
export const attributeMutationOperations = ['add', 'update'];
export const attachmentOperations = ['download', 'upload'];

type Matrix42Session = Awaited<ReturnType<typeof getMatrix42ApiSession>>;
export type Matrix42ExecutionResult = IDataObject | IDataObject[] | INodeExecutionData[];

export function isExecutionDataArray(
	data: Array<IDataObject | INodeExecutionData>,
): data is INodeExecutionData[] {
	return data.some((item) => 'binary' in item || 'pairedItem' in item);
}

export async function executeOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	session: Matrix42Session,
	itemIndex: number,
): Promise<Matrix42ExecutionResult> {
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

export async function executeTemplateOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Matrix42Session,
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

	const templateCode = getNodeParameterString.call(this, 'templateCode', itemIndex);
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

export async function executeDataCardOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Matrix42Session,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	if (!dataCardOperations.includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unsupported data card operation: ${operation}`, {
			itemIndex,
		});
	}

	const templateCode = getNodeParameterString.call(this, 'templateCode', itemIndex);
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
			operation === 'update' ? getNodeParameterString.call(this, 'dataCardId', itemIndex) : '';
		const folderCode = getNodeParameterString.call(this, 'folderCode', itemIndex);
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
		const dataCardId = getNodeParameterString.call(this, 'dataCardId', itemIndex);

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
		const dataCardId = getNodeParameterString.call(this, 'dataCardId', itemIndex);
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

export function getDataCardMutationData(
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

export async function listDataCards(
	this: IExecuteFunctions,
	session: Matrix42Session,
	encodedTemplateCode: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const listOptions = this.getNodeParameter('listOptions', itemIndex) as IDataObject;

	return await listDataCardsWithOptions.call(
		this,
		session,
		encodedTemplateCode,
		listOptions,
		itemIndex,
	);
}

export async function listDataCardsWithOptions(
	this: IExecuteFunctions,
	session: Matrix42Session,
	encodedTemplateCode: string,
	listOptions: IDataObject,
	itemIndex: number,
): Promise<IDataObject[]> {
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

export async function executeAttributeOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Matrix42Session,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const templateCode = getNodeParameterString.call(this, 'templateCode', itemIndex);
	const dataCardId = getNodeParameterString.call(this, 'dataCardId', itemIndex);
	const attributeCode = getNodeParameterString.call(this, 'attributeCode', itemIndex);
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

export async function executeAttachmentOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Matrix42Session,
	itemIndex: number,
): Promise<IDataObject | IDataObject[] | INodeExecutionData[]> {
	if (!attachmentOperations.includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unsupported attachment operation: ${operation}`, {
			itemIndex,
		});
	}

	const templateCode = getNodeParameterString.call(this, 'templateCode', itemIndex);
	const dataCardId = getNodeParameterString.call(this, 'dataCardId', itemIndex);
	const attributeCode = getNodeParameterString.call(this, 'attributeCode', itemIndex);
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

export async function executeUtilityOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Matrix42Session,
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

function getNodeParameterString(
	this: IExecuteFunctions,
	parameterName: string,
	itemIndex: number,
): string {
	return getResourceLocatorValue(this.getNodeParameter(parameterName, itemIndex));
}
