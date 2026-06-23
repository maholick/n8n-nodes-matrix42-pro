import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import {
	buildAttributeValues,
	buildDataCardData,
	buildDataCardQuery,
	cleanDataObject,
	encodePathSegment,
	extractResponseItems,
	getMatrix42ApiSession,
	getResourceLocatorValue,
	matrix42ApiRequest,
	normalizeApiPath,
	normalizeBaseUrl,
} from '../nodes/Matrix42Pro/GenericFunctions';
import {
	executeAttachmentOperation,
	executeAttributeOperation,
	executeDataCardOperation,
	listDataCardsWithOptions,
} from '../nodes/Matrix42Pro/Actions';
import {
	aiToolOperationOptions,
	buildAiToolOutput,
	executeAiToolOperation,
} from '../nodes/Matrix42Pro/AiToolActions';
import {
	getAllowedFolders,
	getAttributeOptions,
	getStaticValueOptions,
	mapTemplateOptions,
} from '../nodes/Matrix42Pro/LoadOptions';

const session = {
	apiPath: '/rest-api/itsm/v1',
	baseUrl: 'https://matrix42.example',
	rejectUnauthorized: true,
	token: 'token',
};

describe('Matrix42 Pro helper functions', () => {
	it('normalizes URLs, API paths, path segments, queries, and resource locator values', () => {
		expect(normalizeBaseUrl(' matrix42.example/ ')).toBe('https://matrix42.example');
		expect(normalizeBaseUrl('http://matrix42.example///')).toBe('http://matrix42.example');
		expect(normalizeApiPath(' rest-api/itsm/v1/ ')).toBe('/rest-api/itsm/v1');
		expect(normalizeApiPath('')).toBe('/rest-api/itsm/v1');
		expect(encodePathSegment('folder one/file.pdf')).toBe('folder%20one/file.pdf');
		expect(getResourceLocatorValue({ mode: 'list', value: 'incident' })).toBe('incident');
		expect(cleanDataObject({ empty: '', keep: false, nested: 0, nil: null })).toEqual({
			keep: false,
			nested: 0,
		});
		expect(
			buildDataCardQuery({
				dataCards: true,
				filter: "$status$ = '02'",
				filterId: 42,
				limit: 200,
				selectedAttributes: ' subject, status ,,priority ',
			}),
		).toEqual({
			dataCards: true,
			filter: "$status$ = '02'",
			filterId: 42,
			limit: 200,
			selectedAttributes: 'subject,status,priority',
		});
	});

	it('builds Matrix42 data-card and attribute value payloads', () => {
		expect(
			buildDataCardData({
				field: [
					{ attributeCode: 'subject', value: 'Created from n8n', valueType: 'string' },
					{ attributeCode: 'priority', code: 'high', value: 'High', valueType: 'staticValue' },
					{ attributeCode: 'impact', codeManual: 'major', valueType: 'staticValue' },
					{ attributeCode: 'assignee', referencedDataCardId: '42', valueType: 'reference' },
					{ attributeCode: '', value: 'ignored', valueType: 'string' },
				],
			}),
		).toEqual({
			assignee: { values: [{ dataCardId: '42' }] },
			impact: { values: [{ code: 'major' }] },
			priority: { values: [{ code: 'high', value: 'High' }] },
			subject: { values: [{ value: 'Created from n8n' }] },
		});

		expect(
			buildAttributeValues({
				value: [
					{ value: '15', valueType: 'number' },
					{ location: 'file-id', name: 'file.pdf', valueType: 'externalReference' },
				],
			}),
		).toEqual({
			values: [{ value: 15 }, { location: 'file-id', name: 'file.pdf' }],
		});
	});

	it('extracts response items from common Matrix42 response shapes', () => {
		expect(extractResponseItems([{ id: 1 }])).toEqual([{ id: 1 }]);
		expect(extractResponseItems({ data: [{ id: 2 }] })).toEqual([{ id: 2 }]);
		expect(extractResponseItems({ dataCard: { id: 3 } })).toEqual([{ id: 3 }]);
		expect(extractResponseItems({ id: 4 })).toEqual([{ id: 4 }]);
		expect(extractResponseItems(undefined)).toEqual([]);
	});
});

describe('Matrix42 Pro API session and error handling', () => {
	it('extracts bearer tokens from the Authorization header', async () => {
		const context = createApiContext({
			httpResponse: {
				headers: {
					Authorization: 'Bearer jwt-token',
				},
			},
		});

		await expect(getMatrix42ApiSession.call(context)).resolves.toMatchObject({
			apiPath: '/rest-api/itsm/v1',
			baseUrl: 'https://matrix42.example',
			token: 'jwt-token',
		});
	});

	it('throws a useful error when login does not return a token', async () => {
		const context = createApiContext({
			httpResponse: {
				headers: {},
			},
		});

		await expect(getMatrix42ApiSession.call(context)).rejects.toThrow(
			'Matrix42 Pro API did not return an authorization token',
		);
	});

	it.each([
		[400, 'request parameters or body'],
		[401, 'JWT token was rejected'],
		[403, 'does not have permission'],
		[404, 'was not found'],
		[409, 'conflicting state'],
		[413, 'too large'],
		[429, 'rate limit'],
	])('maps HTTP %s errors to Matrix42-specific descriptions', async (statusCode, text) => {
		const context = createExecuteContext({}, async () => {
			const error = new Error('Matrix42 Pro API request failed') as Error & {
				response: { statusCode: number };
			};
			error.response = { statusCode };
			throw error;
		});

		await expect(
			matrix42ApiRequest.call(context, session, 'GET', '/dc/incident'),
		).rejects.toMatchObject({
			description: expect.stringContaining(text),
		});
	});
});

describe('Matrix42 Pro operations', () => {
	it('lists data cards with page size 200 and advances filterId', async () => {
		const requests: IDataObject[] = [];
		const firstPage = Array.from({ length: 200 }, (_, index) => ({
			dataCardId: String(1000 - index),
		}));
		const secondPage = Array.from({ length: 50 }, (_, index) => ({
			dataCardId: String(800 - index),
		}));
		const context = createExecuteContext({}, async (request) => {
			requests.push(request);
			return requests.length === 1 ? firstPage : secondPage;
		});

		const records = await listDataCardsWithOptions.call(
			context,
			session,
			'incident',
			{ limit: 250, filter: "$status$ = '02'" },
			0,
		);

		expect(records).toHaveLength(250);
		expect(requests[0].qs).toMatchObject({ filterId: 0, limit: 200 });
		expect(requests[1].qs).toMatchObject({ filterId: 801, limit: 50 });
	});

	it('builds Matrix42 create and update data-card payloads', async () => {
		const requests: IDataObject[] = [];
		const context = createExecuteContext(
			{
				dataMode: 'fields',
				fields: {
					field: [{ attributeCode: 'subject', value: 'Created from n8n', valueType: 'string' }],
				},
				folderCode: { mode: 'list', value: 'incident_management' },
				mutationOptions: { createEmptyReferences: true, dataCards: true },
				templateCode: { mode: 'list', value: 'incident' },
			},
			async (request) => {
				requests.push(request);
				return { dataCardId: '123' };
			},
		);

		await executeDataCardOperation.call(context, 'create', session, 0);

		expect(requests[0]).toMatchObject({
			body: {
				data: {
					subject: {
						values: [{ value: 'Created from n8n' }],
					},
				},
				folderCode: 'incident_management',
			},
			method: 'POST',
			qs: {
				createEmptyReferences: true,
				dataCards: true,
			},
		});

		context.__params.dataCardId = '123';
		await executeDataCardOperation.call(context, 'update', session, 0);

		expect(requests[1]).toMatchObject({
			body: {
				dataCardId: '123',
				folderCode: 'incident_management',
			},
			method: 'PATCH',
			url: 'https://matrix42.example/rest-api/itsm/v1/dc/incident/data/123',
		});
	});

	it('builds attribute add and replace payloads', async () => {
		const requests: IDataObject[] = [];
		const context = createExecuteContext(
			{
				attributeCode: { mode: 'list', value: 'status' },
				attributeValues: {
					value: [{ code: '02', value: 'Solving', valueType: 'staticValue' }],
				},
				dataCardId: '123',
				templateCode: { mode: 'list', value: 'incident' },
			},
			async (request) => {
				requests.push(request);
				return { success: true };
			},
		);

		await executeAttributeOperation.call(context, 'add', session, 0);
		await executeAttributeOperation.call(context, 'update', session, 0);

		expect(requests[0]).toMatchObject({
			body: { values: [{ code: '02', value: 'Solving' }] },
			method: 'POST',
		});
		expect(requests[1]).toMatchObject({
			body: { values: [{ code: '02', value: 'Solving' }] },
			method: 'PUT',
		});
	});

	it('uploads attachments with binary input metadata', async () => {
		const requests: IDataObject[] = [];
		const context = createExecuteContext(
			{
				attributeCode: { mode: 'list', value: 'attachments' },
				binaryPropertyName: 'data',
				dataCardId: '123',
				fileName: '',
				templateCode: { mode: 'list', value: 'incident' },
			},
			async (request) => {
				requests.push(request);
				return { fileName: 'report.pdf' };
			},
			{
				binary: {
					data: {
						fileName: 'report.pdf',
						mimeType: 'application/pdf',
					},
				},
			},
		);

		await executeAttachmentOperation.call(context, 'upload', session, 0);

		expect(requests[0]).toMatchObject({
			json: false,
			method: 'POST',
			url: 'https://matrix42.example/rest-api/itsm/v1/dc/incident/data/123/attachments/file',
		});
		expect(requests[0].body).toBeInstanceOf(FormData);
		expect(context.__getBinaryDataBuffer).toHaveBeenCalledWith(0, 'data');
	});
});

describe('Matrix42 Pro dynamic options', () => {
	it('maps template names and codes from GET /dc', () => {
		expect(
			mapTemplateOptions([
				{ name: 'Incident', templateCode: 'incident' },
				{ code: 'service_request', name: 'Service Request' },
			]),
		).toEqual([
			{ description: 'incident', name: 'Incident', value: 'incident' },
			{
				description: 'service_request',
				name: 'Service Request',
				value: 'service_request',
			},
		]);
	});

	it('maps folders, attributes, file attributes, and static values from template details', () => {
		const template = {
			allowedFolders: [{ folderCode: 'incident_management', folderName: 'Incident Management' }],
			attributes: {
				attachments: { file: true, name: 'Attachments', type: 'EXTERNAL_REFERENCE' },
				status: {
					file: false,
					name: 'Status',
					type: 'STATIC_VALUE',
					values: [{ code: '02', value: { en: 'Solving' } }],
				},
				subject: { name: 'Subject', type: 'STRING' },
			},
		};

		expect(getAllowedFolders(template)).toEqual([
			{
				description: 'incident_management',
				name: 'Incident Management',
				value: 'incident_management',
			},
		]);
		expect(getAttributeOptions(template).map((option) => option.value)).toEqual([
			'attachments',
			'status',
			'subject',
		]);
		expect(getAttributeOptions(template, { fileOnly: true }).map((option) => option.value)).toEqual(
			['attachments'],
		);
		expect(getStaticValueOptions(template.attributes.status)).toEqual([
			{ name: 'Solving', value: '02' },
		]);
	});
});

describe('Matrix42 Pro AI Tool', () => {
	it('exposes only read-only operations', () => {
		expect(aiToolOperationOptions.map((option) => option.value)).toEqual([
			'searchDataCards',
			'getDataCard',
			'getTemplate',
			'getAttribute',
		]);
		expect(aiToolOperationOptions.map((option) => option.value)).not.toContain('create');
		expect(aiToolOperationOptions.map((option) => option.value)).not.toContain('update');
		expect(aiToolOperationOptions.map((option) => option.value)).not.toContain('delete');
		expect(aiToolOperationOptions.map((option) => option.value)).not.toContain('upload');
	});

	it('rejects mutation-style operations explicitly', async () => {
		const context = createExecuteContext({}, async () => ({ ok: true }));

		await expect(executeAiToolOperation.call(context, 'create', session, 0)).rejects.toThrow(
			'Unsupported AI tool operation: create',
		);
	});

	it('returns a compact AI-friendly output shape', () => {
		expect(
			buildAiToolOutput('searchDataCards', [{ dataCardId: '123' }], { templateCode: 'incident' }),
		).toEqual({
			toolSummary: 'Found 1 Matrix42 Pro data card.',
			records: [{ dataCardId: '123' }],
			meta: {
				count: 1,
				operation: 'searchDataCards',
				readOnly: true,
				templateCode: 'incident',
			},
		});
	});
});

interface FakeExecuteContext extends IExecuteFunctions {
	__getBinaryDataBuffer: ReturnType<typeof vi.fn>;
	__params: Record<string, unknown>;
}

function createApiContext({ httpResponse }: { httpResponse: IDataObject }): ILoadOptionsFunctions {
	return {
		getCredentials: vi.fn(async () => ({
			apiPath: 'rest-api/itsm/v1/',
			instanceUrl: 'matrix42.example/',
			password: 'password',
			skipTlsVerify: false,
			username: 'user',
		})),
		getNode: vi.fn(() => fakeNode()),
		helpers: {
			httpRequest: vi.fn(async () => httpResponse),
		},
	} as unknown as ILoadOptionsFunctions;
}

function createExecuteContext(
	params: Record<string, unknown>,
	httpRequest: (request: IDataObject) => Promise<unknown>,
	inputData: IDataObject = {},
): FakeExecuteContext {
	const getBinaryDataBuffer = vi.fn(async () => Buffer.from('binary-data'));

	return {
		__getBinaryDataBuffer: getBinaryDataBuffer,
		__params: params,
		continueOnFail: vi.fn(() => false),
		getInputData: vi.fn(() => [inputData]),
		getNode: vi.fn(() => fakeNode()),
		getNodeParameter: vi.fn((name: string) => params[name]),
		helpers: {
			constructExecutionMetaData: vi.fn((items) => items),
			getBinaryDataBuffer,
			httpRequest: vi.fn(httpRequest),
			prepareBinaryData: vi.fn(async () => ({
				data: 'prepared',
				fileName: 'download.bin',
				mimeType: 'application/octet-stream',
			})),
			returnJsonArray: vi.fn((data: IDataObject | IDataObject[]) =>
				(Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			),
		},
	} as unknown as FakeExecuteContext;
}

function fakeNode() {
	return {
		id: 'matrix42-node',
		name: 'Matrix42 Pro',
		parameters: {},
		position: [0, 0] as [number, number],
		type: 'n8n-nodes-matrix42-pro.matrix42Pro',
		typeVersion: 1,
	};
}
