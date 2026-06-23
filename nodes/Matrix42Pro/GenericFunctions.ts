import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INode,
	INodeExecutionData,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export type Matrix42ApiContext = IExecuteFunctions | IPollFunctions;

export interface Matrix42ApiSession {
	baseUrl: string;
	apiPath: string;
	rejectUnauthorized: boolean;
	token: string;
}

interface Matrix42Credentials {
	apiPath: string;
	baseUrl: string;
	password: string;
	rejectUnauthorized: boolean;
	username: string;
}

interface Matrix42RequestOptions {
	encoding?: IHttpRequestOptions['encoding'];
	formData?: FormData;
	headers?: IDataObject;
	json?: boolean;
	returnFullResponse?: boolean;
}

const credentialType = 'matrix42ProApi';

export function normalizeBaseUrl(instanceUrl: string): string {
	const trimmedUrl = instanceUrl.trim().replace(/\/+$/, '');

	if (/^https?:\/\//i.test(trimmedUrl)) {
		return trimmedUrl;
	}

	return `https://${trimmedUrl}`;
}

export function normalizeApiPath(apiPath: string): string {
	const trimmedPath = apiPath.trim() || '/rest-api/itsm/v1';
	const withLeadingSlash = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;

	return withLeadingSlash.replace(/\/+$/, '');
}

export async function getMatrix42ApiSession(this: Matrix42ApiContext): Promise<Matrix42ApiSession> {
	const credentials = await this.getCredentials(credentialType);
	const baseUrl = normalizeBaseUrl(credentials.instanceUrl as string);
	const apiPath = normalizeApiPath((credentials.apiPath as string) || '/rest-api/itsm/v1');
	const rejectUnauthorized = credentials.skipTlsVerify !== true;

	return await authenticateMatrix42Api.call(this, {
		apiPath,
		baseUrl,
		password: credentials.password as string,
		rejectUnauthorized,
		username: credentials.username as string,
	});
}

async function authenticateMatrix42Api(
	this: Matrix42ApiContext,
	credentials: Matrix42Credentials,
): Promise<Matrix42ApiSession> {
	const authResponse = await this.helpers.httpRequest({
		method: 'POST',
		url: `${credentials.baseUrl}${credentials.apiPath}/users/login`,
		body: new URLSearchParams({
			login: credentials.username,
			password: credentials.password,
		}),
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		json: false,
		returnFullResponse: true,
		skipSslCertificateValidation: !credentials.rejectUnauthorized,
	});

	const headers = authResponse.headers as IDataObject | undefined;
	const authHeader = headers?.authorization ?? headers?.Authorization;
	const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';

	if (!token) {
		throw new NodeOperationError(
			this.getNode(),
			'Matrix42 Pro API did not return an authorization token',
			{
				description:
					'Check the instance URL, API path, credentials, and whether the user has the External API permission.',
			},
		);
	}

	return {
		baseUrl: credentials.baseUrl,
		apiPath: credentials.apiPath,
		rejectUnauthorized: credentials.rejectUnauthorized,
		token,
	};
}

export async function matrix42ApiRequest(
	this: Matrix42ApiContext,
	session: Matrix42ApiSession,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject | IDataObject[],
	qs?: IDataObject,
	itemIndex?: number,
	options: Matrix42RequestOptions = {},
): Promise<unknown> {
	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${session.baseUrl}${session.apiPath}${endpoint}`,
		qs: cleanDataObject(qs),
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${session.token}`,
			...options.headers,
		},
		skipSslCertificateValidation: !session.rejectUnauthorized,
		json: options.json ?? options.formData === undefined,
		returnFullResponse: options.returnFullResponse,
		encoding: options.encoding,
	};

	if (options.formData !== undefined) {
		requestOptions.body = options.formData;
	} else if (body !== undefined) {
		requestOptions.body = body;
		requestOptions.headers = {
			...requestOptions.headers,
			'Content-Type': 'application/json',
		};
	}

	try {
		return await this.helpers.httpRequest(requestOptions);
	} catch (error) {
		throw toMatrix42OperationError.call(this, error, itemIndex);
	}
}

export function buildDataCardData(fields: IDataObject): IDataObject {
	const rows = getCollectionRows(fields, 'field');
	const data: IDataObject = {};

	for (const row of rows) {
		const attributeCode = stringValue(row.attributeCode).trim();

		if (!attributeCode) {
			continue;
		}

		const attribute = (data[attributeCode] as IDataObject | undefined) ?? { values: [] };
		const values = attribute.values as IDataObject[];

		values.push(buildValueElement(row));
		attribute.values = values;
		data[attributeCode] = attribute;
	}

	return data;
}

export function buildAttributeValues(valuesCollection: IDataObject): IDataObject {
	const rows = getCollectionRows(valuesCollection, 'value');

	return {
		values: rows.map((row) => buildValueElement(row)),
	};
}

export function parseJsonParameter(
	value: unknown,
	fieldName: string,
	node: INode,
): IDataObject | IDataObject[] {
	if (typeof value === 'object' && value !== null) {
		return value as IDataObject | IDataObject[];
	}

	if (typeof value !== 'string' || value.trim() === '') {
		return {};
	}

	try {
		return JSON.parse(value) as IDataObject | IDataObject[];
	} catch (error) {
		const description = error instanceof Error ? error.message : 'The value must be valid JSON.';

		throw new NodeOperationError(node, `Invalid JSON in ${fieldName}`, {
			description,
		});
	}
}

export function buildDataCardQuery(additionalFields: IDataObject): IDataObject {
	return (
		cleanDataObject({
			filter: additionalFields.filter,
			dataCards: additionalFields.dataCards,
			selectedAttributes: normalizeCsv(additionalFields.selectedAttributes),
			limit: additionalFields.limit,
			filterId: additionalFields.filterId,
		}) ?? {}
	);
}

export function extractResponseItems(response: unknown): IDataObject[] {
	if (Array.isArray(response)) {
		return response as IDataObject[];
	}

	if (!isDataObject(response)) {
		return [];
	}

	if (Array.isArray(response.data)) {
		return response.data as IDataObject[];
	}

	if (isDataObject(response.dataCard)) {
		return [response.dataCard];
	}

	return [response];
}

export function toExecutionData(
	this: IExecuteFunctions,
	data: IDataObject | IDataObject[],
	itemIndex: number,
): INodeExecutionData[] {
	return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(data), {
		itemData: { item: itemIndex },
	});
}

export function getDataCardId(card: IDataObject): string | undefined {
	const rawId = card.dataCardId ?? card.id;

	if (rawId === undefined || rawId === null) {
		return undefined;
	}

	return String(rawId);
}

export function encodePathSegment(value: string): string {
	return value
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
}

export function cleanDataObject(data?: IDataObject): IDataObject | undefined {
	if (data === undefined) {
		return undefined;
	}

	const cleaned: IDataObject = {};

	for (const [key, value] of Object.entries(data)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}

		cleaned[key] = value;
	}

	return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function buildValueElement(row: IDataObject): IDataObject {
	const valueType = stringValue(row.valueType || 'string');

	switch (valueType) {
		case 'externalReference':
			return cleanDataObject({
				name: row.name || row.value,
				location: row.location || row.value,
			}) as IDataObject;

		case 'number': {
			const parsedValue = Number(row.value);

			return {
				value: Number.isNaN(parsedValue) ? row.value : parsedValue,
			};
		}

		case 'reference':
			return {
				dataCardId: stringValue(row.referencedDataCardId || row.value),
			};

		case 'staticValue':
			return cleanDataObject({
				value: row.value,
				code: row.code,
			}) as IDataObject;

		default:
			return {
				value: row.value,
			};
	}
}

function getCollectionRows(collection: IDataObject, key: string): IDataObject[] {
	const rows = collection[key];

	if (!Array.isArray(rows)) {
		return [];
	}

	return rows as IDataObject[];
}

function normalizeCsv(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const csv = value
		.split(',')
		.map((attribute) => attribute.trim())
		.filter(Boolean)
		.join(',');

	return csv || undefined;
}

function stringValue(value: unknown): string {
	if (value === undefined || value === null) {
		return '';
	}

	return String(value);
}

function isDataObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toMatrix42OperationError(
	this: Matrix42ApiContext,
	error: unknown,
	itemIndex?: number,
): NodeOperationError {
	const apiError = error as {
		message?: string;
		response?: {
			body?: unknown;
			data?: unknown;
			statusCode?: number;
			status?: number;
		};
		statusCode?: number;
	};
	const responseData = apiError.response?.data ?? apiError.response?.body;
	const statusCode =
		apiError.response?.status ?? apiError.response?.statusCode ?? apiError.statusCode;
	const message = apiError.message || 'Matrix42 Pro API request failed';
	const description = getApiErrorDescription(responseData, statusCode);

	return new NodeOperationError(this.getNode(), message, {
		description,
		itemIndex,
	});
}

function getApiErrorDescription(responseData: unknown, statusCode?: number): string {
	if (isDataObject(responseData)) {
		const message = responseData.message ?? responseData.error ?? responseData.description;

		if (typeof message === 'string') {
			return statusCode !== undefined ? `${statusCode}: ${message}` : message;
		}
	}

	if (typeof responseData === 'string' && responseData.trim() !== '') {
		return statusCode !== undefined ? `${statusCode}: ${responseData}` : responseData;
	}

	switch (statusCode) {
		case 400:
			return 'The request parameters or body were not accepted by Matrix42 Pro.';
		case 401:
			return 'The JWT token was rejected. Check credentials and External API permissions.';
		case 403:
			return 'The authenticated user does not have permission for this template, folder, or data card.';
		case 404:
			return 'The requested template, data card, attribute, or attachment was not found.';
		case 409:
			return 'The data card is locked, already deleted, or otherwise in a conflicting state.';
		case 413:
			return 'The uploaded file is too large for the Matrix42 Pro API.';
		case 429:
			return 'The Matrix42 Pro API rate limit was exceeded. Retry after the cooldown window.';
		default:
			return 'Check the Matrix42 Pro REST API response and node parameters.';
	}
}
