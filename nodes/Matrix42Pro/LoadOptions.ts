import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';

import {
	extractResponseItems,
	getMatrix42ApiSession,
	getResourceLocatorValue,
	matrix42ApiRequest,
} from './GenericFunctions';

interface Matrix42AttributeOption extends INodePropertyOptions {
	file?: boolean;
	staticValues?: INodePropertyOptions[];
	type?: string;
}

export const matrix42Methods = {
	loadOptions: {
		async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
			return await loadTemplateOptions.call(this);
		},

		async getAllowedFolders(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
			const template = await loadTemplateDetails.call(this);

			return getAllowedFolders(template);
		},

		async getAttributes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
			const template = await loadTemplateDetails.call(this);

			return getAttributeOptions(template);
		},

		async getFileAttributes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
			const template = await loadTemplateDetails.call(this);

			return getAttributeOptions(template, { fileOnly: true });
		},

		async getStaticValues(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
			const template = await loadTemplateDetails.call(this);
			const attributeCode = getCurrentParameterValue(this, 'attributeCode');
			const attribute = getTemplateAttributes(template).find(
				(option) => option.value === attributeCode,
			);

			return attribute?.staticValues ?? [];
		},
	},

	listSearch: {
		async searchTemplates(
			this: ILoadOptionsFunctions,
			filter?: string,
		): Promise<INodeListSearchResult> {
			return toListSearchResult(await loadTemplateOptions.call(this), filter);
		},

		async searchAllowedFolders(
			this: ILoadOptionsFunctions,
			filter?: string,
		): Promise<INodeListSearchResult> {
			const template = await loadTemplateDetails.call(this);

			return toListSearchResult(getAllowedFolders(template), filter);
		},

		async searchAttributes(
			this: ILoadOptionsFunctions,
			filter?: string,
		): Promise<INodeListSearchResult> {
			const template = await loadTemplateDetails.call(this);

			return toListSearchResult(getAttributeOptions(template), filter);
		},

		async searchFileAttributes(
			this: ILoadOptionsFunctions,
			filter?: string,
		): Promise<INodeListSearchResult> {
			const template = await loadTemplateDetails.call(this);

			return toListSearchResult(getAttributeOptions(template, { fileOnly: true }), filter);
		},
	},
};

export function mapTemplateOptions(response: unknown): INodePropertyOptions[] {
	return sortOptions(
		extractResponseItems(response).flatMap((template) => {
			const value = stringValue(template.templateCode ?? template.code ?? template.id);
			const name = stringValue(template.name ?? template.displayName ?? value);

			if (!value) {
				return [];
			}

			return [
				{
					name: name || value,
					value,
					description: value !== name ? value : undefined,
				},
			];
		}),
	);
}

export function getAllowedFolders(template: IDataObject): INodePropertyOptions[] {
	const folders = Array.isArray(template.allowedFolders)
		? (template.allowedFolders as IDataObject[])
		: [];

	return sortOptions(
		folders.flatMap((folder) => {
			const value = stringValue(folder.folderCode ?? folder.code ?? folder.id);
			const name = stringValue(folder.folderName ?? folder.name ?? value);

			if (!value) {
				return [];
			}

			return [
				{
					name: name || value,
					value,
					description: value !== name ? value : undefined,
				},
			];
		}),
	);
}

export function getAttributeOptions(
	template: IDataObject,
	options: { fileOnly?: boolean } = {},
): Matrix42AttributeOption[] {
	return sortOptions(
		getTemplateAttributes(template).filter((attribute) =>
			options.fileOnly ? attribute.file === true : true,
		),
	);
}

export function getTemplateAttributes(template: IDataObject): Matrix42AttributeOption[] {
	const attributes = template.attributes;

	if (!isDataObject(attributes)) {
		return [];
	}

	return Object.entries(attributes).flatMap(([attributeCode, rawAttribute]) => {
		if (!isDataObject(rawAttribute)) {
			return [];
		}

		const name = stringValue(rawAttribute.name ?? attributeCode);
		const type = stringValue(rawAttribute.type);
		const file = rawAttribute.file === true;
		const staticValues = getStaticValueOptions(rawAttribute);
		const descriptionParts = [attributeCode, type, file ? 'file' : undefined].filter(Boolean);

		return [
			{
				name: name || attributeCode,
				value: attributeCode,
				description: descriptionParts.join(' | '),
				file,
				staticValues,
				type,
			},
		];
	});
}

export function getStaticValueOptions(attribute: IDataObject): INodePropertyOptions[] {
	const values = Array.isArray(attribute.values) ? (attribute.values as IDataObject[]) : [];

	return sortOptions(
		values.flatMap((staticValue) => {
			const value = stringValue(staticValue.code ?? staticValue.value);
			const name = getStaticValueName(staticValue.value, value);

			if (!value) {
				return [];
			}

			return [
				{
					name,
					value,
				},
			];
		}),
	);
}

async function loadTemplateOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const session = await getMatrix42ApiSession.call(this);
	const response = await matrix42ApiRequest.call(this, session, 'GET', '/dc');

	return mapTemplateOptions(response);
}

async function loadTemplateDetails(this: ILoadOptionsFunctions): Promise<IDataObject> {
	const templateCode = getCurrentParameterValue(this, 'templateCode');

	if (!templateCode) {
		return {};
	}

	const session = await getMatrix42ApiSession.call(this);
	const response = await matrix42ApiRequest.call(
		this,
		session,
		'GET',
		`/dc/${encodeURIComponent(templateCode)}`,
	);
	const details = extractResponseItems(response)[0];

	return details ?? (isDataObject(response) ? response : {});
}

function getCurrentParameterValue(context: ILoadOptionsFunctions, parameterName: string): string {
	const parameter = context.getCurrentNodeParameter(parameterName);

	if (parameter !== undefined) {
		return getResourceLocatorValue(parameter);
	}

	const nestedValue = context.getCurrentNodeParameter(`${parameterName}.value`);

	return getResourceLocatorValue(nestedValue);
}

function toListSearchResult(
	options: INodePropertyOptions[],
	filter?: string,
): INodeListSearchResult {
	const normalizedFilter = stringValue(filter).trim().toLowerCase();
	const results = options
		.filter((option) => {
			if (!normalizedFilter) {
				return true;
			}

			return `${option.name} ${option.value} ${option.description ?? ''}`
				.toLowerCase()
				.includes(normalizedFilter);
		})
		.slice(0, 100);

	return { results };
}

function sortOptions<T extends INodePropertyOptions>(options: T[]): T[] {
	return [...options].sort((left, right) => left.name.localeCompare(right.name));
}

function getStaticValueName(value: unknown, fallback: string): string {
	if (isDataObject(value)) {
		const localizedValue =
			value.en ?? value.de ?? value.fi ?? value.fr ?? value.name ?? value.value ?? value.label;

		return stringValue(localizedValue || fallback) || fallback;
	}

	return stringValue(value || fallback) || fallback;
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
