import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import {
	buildDataCardQuery,
	extractResponseItems,
	getDataCardId,
	getMatrix42ApiSession,
	matrix42ApiRequest,
} from './GenericFunctions';

export class Matrix42ProTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Matrix42 Pro Trigger',
		name: 'matrix42ProTrigger',
		icon: {
			light: 'file:matrix42pro.svg',
			dark: 'file:matrix42pro.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		usableAsTool: true,
		description: 'Start workflows when Matrix42 Pro data cards appear in a template query',
		subtitle: '={{$parameter["templateCode"]}}',
		defaults: {
			name: 'Matrix42 Pro Trigger',
		},
		credentials: [
			{
				name: 'matrix42ProApi',
				required: true,
			},
		],
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Template Code',
				name: 'templateCode',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'incident',
				description: 'Template code to monitor',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Emit Existing Data on First Poll',
						name: 'emitOnFirstPoll',
						type: 'boolean',
						default: false,
						description:
							'Whether to emit currently matching data cards the first time the trigger runs. Disabled by default to avoid flooding workflows.',
					},
					{
						displayName: 'Filter',
						name: 'filter',
						type: 'string',
						default: '',
						placeholder: "$status$ = '01 - New'",
						description: 'EQL filter using Matrix42/Efecte attribute syntax',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 200,
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
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const templateCode = this.getNodeParameter('templateCode') as string;
		const options = this.getNodeParameter('options') as IDataObject;
		const session = await getMatrix42ApiSession.call(this);
		const staticData = this.getWorkflowStaticData('node') as IDataObject;
		const knownIds = Array.isArray(staticData.knownDataCardIds)
			? (staticData.knownDataCardIds as string[])
			: [];
		const response = await matrix42ApiRequest.call(
			this,
			session,
			'GET',
			`/dc/${encodeURIComponent(templateCode)}/data`,
			undefined,
			buildDataCardQuery({
				...options,
				limit: options.limit || 50,
			}),
		);
		const dataCards = extractResponseItems(response);
		const nextKnownIds = new Set(knownIds);
		const newDataCards: IDataObject[] = [];

		for (const dataCard of dataCards) {
			const dataCardId = getDataCardId(dataCard);

			if (dataCardId === undefined) {
				continue;
			}

			if (!nextKnownIds.has(dataCardId)) {
				newDataCards.push(dataCard);
			}

			nextKnownIds.add(dataCardId);
		}

		staticData.knownDataCardIds = [...nextKnownIds].slice(-1000);

		if (staticData.initialized !== true) {
			staticData.initialized = true;

			if (options.emitOnFirstPoll !== true) {
				return null;
			}
		}

		if (newDataCards.length === 0) {
			return null;
		}

		return [this.helpers.returnJsonArray(newDataCards)];
	}
}
