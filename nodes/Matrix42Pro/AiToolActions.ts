import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	buildDataCardQuery,
	cleanDataObject,
	extractResponseItems,
	getMatrix42ApiSession,
	getResourceLocatorValue,
	matrix42ApiRequest,
} from './GenericFunctions';

type Matrix42Session = Awaited<ReturnType<typeof getMatrix42ApiSession>>;

export const aiToolOperationOptions = [
	{
		name: 'Search Data Cards',
		value: 'searchDataCards',
		description: 'Search Matrix42 Pro data cards by template and optional EQL filter',
		action: 'Search data cards',
	},
	{
		name: 'Get Data Card',
		value: 'getDataCard',
		description: 'Get one Matrix42 Pro data card by ID',
		action: 'Get a data card',
	},
	{
		name: 'Get Template',
		value: 'getTemplate',
		description: 'Get Matrix42 Pro template metadata, including attributes and folders',
		action: 'Get a template',
	},
	{
		name: 'Get Attribute',
		value: 'getAttribute',
		description: 'Get one attribute value from a Matrix42 Pro data card',
		action: 'Get an attribute',
	},
] as const;

export type Matrix42AiToolOperation = (typeof aiToolOperationOptions)[number]['value'];

export interface Matrix42AiToolOutput extends IDataObject {
	toolSummary: string;
	records: IDataObject[];
	meta: IDataObject;
}

export async function executeAiToolOperation(
	this: IExecuteFunctions,
	operation: string,
	session: Matrix42Session,
	itemIndex: number,
): Promise<Matrix42AiToolOutput> {
	if (!isAiToolOperation(operation)) {
		throw new NodeOperationError(this.getNode(), `Unsupported AI tool operation: ${operation}`, {
			description:
				'Matrix42 Pro AI Tool only supports read-only operations. Use the Matrix42 Pro workflow node with human review for mutations.',
			itemIndex,
		});
	}

	if (operation === 'getTemplate') {
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
		const records = extractResponseItems(response);

		return buildAiToolOutput(operation, records, {
			templateCode,
		});
	}

	if (operation === 'searchDataCards') {
		const templateCode = getNodeParameterString.call(this, 'templateCode', itemIndex);
		const searchOptions = this.getNodeParameter('searchOptions', itemIndex) as IDataObject;
		const limit = Math.min(Number(searchOptions.limit || 10), 50);
		const response = await matrix42ApiRequest.call(
			this,
			session,
			'GET',
			`/dc/${encodeURIComponent(templateCode)}/data`,
			undefined,
			buildDataCardQuery({
				...searchOptions,
				limit,
			}),
			itemIndex,
		);
		const records = extractResponseItems(response).slice(0, limit);

		return buildAiToolOutput(operation, records, {
			templateCode,
			limit,
			filter: searchOptions.filter,
		});
	}

	if (operation === 'getDataCard') {
		const templateCode = getNodeParameterString.call(this, 'templateCode', itemIndex);
		const dataCardId = getNodeParameterString.call(this, 'dataCardId', itemIndex);
		const getOptions = this.getNodeParameter('getOptions', itemIndex) as IDataObject;
		const response = await matrix42ApiRequest.call(
			this,
			session,
			'GET',
			`/dc/${encodeURIComponent(templateCode)}/data/${encodeURIComponent(dataCardId)}`,
			undefined,
			cleanDataObject({
				selectedAttributes: getOptions.selectedAttributes,
			}),
			itemIndex,
		);
		const records = extractResponseItems(response);

		return buildAiToolOutput(operation, records, {
			templateCode,
			dataCardId,
		});
	}

	const templateCode = getNodeParameterString.call(this, 'templateCode', itemIndex);
	const dataCardId = getNodeParameterString.call(this, 'dataCardId', itemIndex);
	const attributeCode = getNodeParameterString.call(this, 'attributeCode', itemIndex);
	const response = await matrix42ApiRequest.call(
		this,
		session,
		'GET',
		`/dc/${encodeURIComponent(templateCode)}/data/${encodeURIComponent(
			dataCardId,
		)}/${encodeURIComponent(attributeCode)}`,
		undefined,
		undefined,
		itemIndex,
	);
	const records = extractResponseItems(response);

	return buildAiToolOutput(operation, records, {
		templateCode,
		dataCardId,
		attributeCode,
	});
}

export function buildAiToolOutput(
	operation: Matrix42AiToolOperation,
	records: IDataObject[],
	meta: IDataObject,
): Matrix42AiToolOutput {
	return {
		toolSummary: getToolSummary(operation, records),
		records,
		meta: cleanDataObject({
			...meta,
			operation,
			count: records.length,
			readOnly: true,
		}) as IDataObject,
	};
}

function getToolSummary(operation: Matrix42AiToolOperation, records: IDataObject[]): string {
	const count = records.length;

	switch (operation) {
		case 'searchDataCards':
			return `Found ${count} Matrix42 Pro data card${count === 1 ? '' : 's'}.`;
		case 'getDataCard':
			return count > 0 ? 'Retrieved the Matrix42 Pro data card.' : 'No data card was found.';
		case 'getTemplate':
			return count > 0 ? 'Retrieved the Matrix42 Pro template.' : 'No template was found.';
		case 'getAttribute':
			return count > 0 ? 'Retrieved the Matrix42 Pro attribute.' : 'No attribute value was found.';
	}
}

function isAiToolOperation(operation: string): operation is Matrix42AiToolOperation {
	return aiToolOperationOptions.some((option) => option.value === operation);
}

function getNodeParameterString(
	this: IExecuteFunctions,
	parameterName: string,
	itemIndex: number,
): string {
	return getResourceLocatorValue(this.getNodeParameter(parameterName, itemIndex));
}
