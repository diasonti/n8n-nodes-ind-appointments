import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class IndGetAppointmentSlots implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'IND: Get Appointment Slots',
        name: 'indGetAppointmentSlots',
        icon: { light: 'file:ind.svg', dark: 'file:ind.svg' },
        group: ['input'],
        version: 1,
        subtitle: '={{$parameter["desk"] + " / " + $parameter["product"]}}',
        description: 'Fetch available IND appointment slots',
        defaults: {
            name: 'IND: Get Appointment Slots',
        },
        inputs: [NodeConnectionTypes.Main],
        outputs: [NodeConnectionTypes.Main],
        usableAsTool: true,
        properties: [
            {
                displayName: 'Desk',
                name: 'desk',
                type: 'string',
                default: '',
                placeholder: 'AM',
                required: true,
                description: 'IND desk code',
            },
            {
                displayName: 'Product',
                name: 'product',
                type: 'string',
                default: '',
                placeholder: 'DOC',
                required: true,
                description: 'IND product code, sent as the productKey query parameter',
            },
            {
                displayName: 'Persons',
                name: 'persons',
                type: 'number',
                default: 1,
                required: true,
                typeOptions: { minValue: 1, numberPrecision: 0 },
                description: 'Number of persons attending the appointment (a positive integer)',
            },
            {
                displayName: 'Options',
                name: 'options',
                type: 'collection',
                placeholder: 'Add Option',
                default: {},
                options: [
                    {
                        displayName: 'Explode Slots',
                        name: 'explodeSlots',
                        type: 'boolean',
                        default: false,
                        description:
                            'Whether to return one output item per slot with slot fields at the top level. No available slots produces no items.',
                    },
                    {
                        displayName: 'Include Input Fields',
                        name: 'includeInputFields',
                        type: 'boolean',
                        default: false,
                        description:
                            'Whether to include input JSON fields in successful outputs. Node output fields override input fields with the same names.',
                    },
                ],
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const item = items[itemIndex];

            try {
                const desk = this.getNodeParameter('desk', itemIndex) as string;
                const product = this.getNodeParameter('product', itemIndex) as string;
                const persons = this.getNodeParameter('persons', itemIndex) as number;
                const options = this.getNodeParameter('options', itemIndex, {}) as {
                    explodeSlots?: boolean;
                    includeInputFields?: boolean;
                };

                if (typeof desk !== 'string' || desk.trim() === '') {
                    throw new NodeOperationError(
                        this.getNode(),
                        'Desk must be a non-empty string',
                        {
                            itemIndex,
                        },
                    );
                }

                if (typeof product !== 'string' || product.trim() === '') {
                    throw new NodeOperationError(
                        this.getNode(),
                        'Product must be a non-empty string',
                        {
                            itemIndex,
                        },
                    );
                }

                if (!Number.isInteger(persons) || persons < 1) {
                    throw new NodeOperationError(
                        this.getNode(),
                        'Persons must be a positive integer',
                        {
                            itemIndex,
                        },
                    );
                }

                const responseBody = (await this.helpers.httpRequest({
                    method: 'GET',
                    url: `https://oap.ind.nl/oap/api/desks/${encodeURIComponent(desk.trim())}/slots`,
                    qs: { productKey: product.trim(), persons },
                    encoding: 'text',
                    json: false,
                })) as string;

                let response: { status?: unknown; data?: unknown };
                try {
                    response = JSON.parse(responseBody.replace(/^\s*\)\]\}',?\s*/, ''));
                } catch {
                    throw new NodeOperationError(
                        this.getNode(),
                        'IND returned an invalid JSON response',
                        {
                            itemIndex,
                        },
                    );
                }

                if (!response || typeof response !== 'object' || Array.isArray(response)) {
                    throw new NodeOperationError(
                        this.getNode(),
                        'IND returned an invalid response',
                        {
                            itemIndex,
                        },
                    );
                }

                if (response.status !== 'OK') {
                    throw new NodeOperationError(
                        this.getNode(),
                        `IND returned status "${String(response.status)}" instead of "OK"`,
                        { itemIndex },
                    );
                }

                if (!Array.isArray(response.data)) {
                    throw new NodeOperationError(
                        this.getNode(),
                        'IND response data must be a slots array',
                        {
                            itemIndex,
                        },
                    );
                }

                const inputFields = options.includeInputFields ? item.json : {};
                const nodeFields = { desk: desk.trim(), product: product.trim(), persons };

                if (options.explodeSlots) {
                    for (const slot of response.data) {
                        returnData.push({
                            json: { ...inputFields, ...slot, ...nodeFields },
                            pairedItem: { item: itemIndex },
                        });
                    }
                } else {
                    returnData.push({
                        json: { ...inputFields, ...nodeFields, slots: response.data },
                        pairedItem: { item: itemIndex },
                    });
                }
            } catch (error) {
                const nodeError =
                    error instanceof NodeOperationError
                        ? error
                        : new NodeOperationError(this.getNode(), error as Error, { itemIndex });

                if (!this.continueOnFail()) {
                    throw nodeError;
                }

                returnData.push({
                    ...item,
                    json: { ...item.json, error: nodeError.message },
                    pairedItem: { item: itemIndex },
                });
            }
        }

        return [returnData];
    }
}
