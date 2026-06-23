import type { ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class Matrix42ProApi implements ICredentialType {
	name = 'matrix42ProApi';

	displayName = 'Matrix42 Pro API';

	icon: Icon = {
		light: 'file:../icons/matrix42pro.svg',
		dark: 'file:../icons/matrix42pro.dark.svg',
	};

	documentationUrl = 'https://github.com/maholick/n8n-nodes-matrix42-pro#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Instance URL',
			name: 'instanceUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://your-instance.efectecloud.com',
			description: 'Base URL of the Matrix42 Pro or Efecte Service Management instance',
		},
		{
			displayName: 'API Path',
			name: 'apiPath',
			type: 'string',
			default: '/rest-api/itsm/v1',
			required: true,
			description:
				'REST API path. Cloud environments usually use /rest-api/itsm/v1, while on-premises environments may use /itsm/api/v1.',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			description: 'Local ESM user with External API permission',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
		{
			displayName: 'Allow Unauthorized Certificates',
			name: 'skipTlsVerify',
			type: 'boolean',
			default: false,
			description:
				'Whether to allow self-signed or otherwise invalid TLS certificates. Enable only for trusted development or on-premises environments.',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.instanceUrl.replace(/\\/$/, "")}}',
			url: '={{($credentials.apiPath || "/rest-api/itsm/v1").replace(/^\\/?/, "/").replace(/\\/$/, "")}}/users/login',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: {
				login: '={{$credentials.username}}',
				password: '={{$credentials.password}}',
			},
		},
	};
}
