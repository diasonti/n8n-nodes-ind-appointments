const assert = require('node:assert/strict');
const { test } = require('node:test');
const { IndGetAppointmentSlots } = require('../dist/nodes/Ind/IndGetAppointmentSlots.node.js');

function apiResponse(data = [], status = 'OK', prefix = ")]}',\n") {
    return prefix + JSON.stringify({ status, data });
}

function execute(items, parameters = {}, options = {}) {
    const node = new IndGetAppointmentSlots();
    const context = {
        getInputData: () => items,
        getNodeParameter: (name, itemIndex, fallbackValue) => {
            const value = Object.hasOwn(parameters, name)
                ? parameters[name]
                : ({ desk: 'AM', product: 'DOC', persons: 1 }[name] ?? fallbackValue);
            return typeof value === 'function' ? value(itemIndex) : value;
        },
        getNode: () => ({
            id: 'test-ind',
            name: 'IND: Get Appointment Slots',
            type: 'n8n-nodes-ind-appointments.indGetAppointmentSlots',
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
        }),
        continueOnFail: () => options.continueOnFail ?? false,
        helpers: { httpRequest: options.httpRequest ?? (async () => apiResponse()) },
    };

    return node.execute.call(context);
}

test('uses action-specific internal and display names', () => {
    const { description } = new IndGetAppointmentSlots();
    assert.equal(description.name, 'indGetAppointmentSlots');
    assert.equal(description.displayName, 'IND: Get Appointment Slots');
    assert.equal(description.defaults.name, 'IND: Get Appointment Slots');
});

test('provides an optional input-field flag that defaults to false', () => {
    const options = new IndGetAppointmentSlots().description.properties.find(
        ({ name }) => name === 'options',
    );
    assert.equal(options.type, 'collection');
    assert.deepEqual(options.default, {});
    assert.notEqual(options.required, true);
    const flag = options.options.find(({ name }) => name === 'includeInputFields');
    assert.equal(flag.type, 'boolean');
    assert.equal(flag.default, false);
    assert.notEqual(flag.required, true);
});

test('provides an optional explode-slots flag that defaults to false', () => {
    const options = new IndGetAppointmentSlots().description.properties.find(
        ({ name }) => name === 'options',
    );
    const flag = options.options.find(({ name }) => name === 'explodeSlots');
    assert.equal(flag.type, 'boolean');
    assert.equal(flag.default, false);
    assert.notEqual(flag.required, true);
});

test('fetches slots and strips XSSI without copying or mutating input', async () => {
    const slots = [
        {
            key: 'appointment-key',
            date: '2026-10-20',
            startTime: '11:25',
            endTime: '11:55',
            parts: 6,
        },
    ];
    const items = [{ json: { id: 1 } }];
    const requests = [];
    const [output] = await execute(
        items,
        { persons: 6 },
        {
            httpRequest: async (options) => {
                requests.push(options);
                return apiResponse(slots);
            },
        },
    );

    assert.deepEqual(requests, [
        {
            method: 'GET',
            url: 'https://oap.ind.nl/oap/api/desks/AM/slots',
            qs: { productKey: 'DOC', persons: 6 },
            encoding: 'text',
            json: false,
        },
    ]);
    assert.deepEqual(output, [{ json: { slots }, pairedItem: { item: 0 } }]);
    assert.deepEqual(items, [{ json: { id: 1 } }]);
});

test('omits node settings, upstream fields, and binary when the flag is absent or disabled', async (t) => {
    for (const parameters of [{}, { options: {} }, { options: { includeInputFields: false } }]) {
        await t.test(JSON.stringify(parameters), async () => {
            const [output] = await execute(
                [
                    {
                        json: {
                            id: 1,
                            desk: 'input-desk',
                            product: 'input-product',
                            persons: 99,
                            slots: [{ key: 'input-slot' }],
                        },
                        binary: { attachment: { data: 'aGVsbG8=', mimeType: 'text/plain' } },
                    },
                ],
                parameters,
            );
            assert.deepEqual(output, [
                {
                    json: { slots: [] },
                    pairedItem: { item: 0 },
                },
            ]);
        });
    }
});

test('includes only configured desk, product, and persons when enabled, not upstream fields', async () => {
    const items = [
        {
            json: {
                id: 1,
                details: { label: 'original' },
                desk: 'input-desk',
                product: 'input-product',
                persons: 99,
                slots: [{ key: 'input-slot' }],
            },
            binary: { attachment: { data: 'aGVsbG8=', mimeType: 'text/plain' } },
        },
    ];
    const originalItems = structuredClone(items);
    const slots = [{ key: 'api-slot' }];
    const [output] = await execute(
        items,
        { desk: ' AM ', product: ' DOC ', persons: 6, options: { includeInputFields: true } },
        { httpRequest: async () => apiResponse(slots) },
    );

    assert.deepEqual(output, [
        {
            json: {
                desk: 'AM',
                product: 'DOC',
                persons: 6,
                slots,
            },
            pairedItem: { item: 0 },
        },
    ]);
    assert.deepEqual(items, originalItems);
});

test('keeps slots grouped when explode-slots is absent or disabled', async (t) => {
    const slots = [{ key: 'first-slot' }, { key: 'second-slot' }];
    for (const parameters of [{}, { options: {} }, { options: { explodeSlots: false } }]) {
        await t.test(JSON.stringify(parameters), async () => {
            const [output] = await execute([{ json: {} }], parameters, {
                httpRequest: async () => apiResponse(slots),
            });
            assert.deepEqual(output, [
                {
                    json: { slots },
                    pairedItem: { item: 0 },
                },
            ]);
        });
    }
});

test('explodes slots into flat items without node settings, upstream fields, or binary by default', async () => {
    const slots = [
        {
            key: 'first-slot',
            date: '2026-10-20',
            startTime: '11:25',
            endTime: '11:55',
            parts: 6,
        },
        { key: 'second-slot', details: { label: 'unchanged' } },
    ];
    const items = [
        {
            json: {
                id: 1,
                key: 'input-slot',
                desk: 'input-desk',
                product: 'input-product',
                persons: 99,
            },
            binary: { attachment: { data: 'aGVsbG8=', mimeType: 'text/plain' } },
        },
    ];
    const originalItems = structuredClone(items);
    let requests = 0;
    const [output] = await execute(
        items,
        { desk: ' AM ', product: ' DOC ', persons: 6, options: { explodeSlots: true } },
        {
            httpRequest: async () => {
                requests++;
                return apiResponse(slots);
            },
        },
    );

    assert.equal(requests, 1);
    assert.deepEqual(
        output,
        slots.map((slot) => ({
            json: slot,
            pairedItem: { item: 0 },
        })),
    );
    assert.deepEqual(items, originalItems);
});

test('includes only configured fields in each exploded item, overriding slot values without copying upstream fields', async () => {
    const items = [
        {
            json: {
                id: 1,
                key: 'input-slot',
                date: 'input-date',
                desk: 'input-desk',
                product: 'input-product',
                persons: 99,
            },
            binary: { attachment: { data: 'aGVsbG8=', mimeType: 'text/plain' } },
        },
    ];
    const originalItems = structuredClone(items);
    const [output] = await execute(
        items,
        {
            desk: ' AM ',
            product: ' DOC ',
            persons: 6,
            options: { explodeSlots: true, includeInputFields: true },
        },
        {
            httpRequest: async () =>
                apiResponse([
                    {
                        key: 'first-slot',
                        date: '2026-10-20',
                        desk: 'slot-desk',
                        product: 'slot-product',
                        persons: 42,
                    },
                    { key: 'second-slot', date: '2026-10-21' },
                ]),
        },
    );

    assert.deepEqual(output, [
        {
            json: {
                key: 'first-slot',
                date: '2026-10-20',
                desk: 'AM',
                product: 'DOC',
                persons: 6,
            },
            pairedItem: { item: 0 },
        },
        {
            json: {
                key: 'second-slot',
                date: '2026-10-21',
                desk: 'AM',
                product: 'DOC',
                persons: 6,
            },
            pairedItem: { item: 0 },
        },
    ]);
    assert.deepEqual(items, originalItems);
});

test('returns zero items for empty slots when exploding, regardless of input-field inclusion', async (t) => {
    for (const includeInputFields of [false, true]) {
        await t.test(String(includeInputFields), async () => {
            assert.deepEqual(
                await execute([{ json: { id: 1 } }], {
                    options: { explodeSlots: true, includeInputFields },
                }),
                [[]],
            );
        });
    }
});

test('evaluates explode-slots per input item and preserves ordering and item links', async () => {
    const [output] = await execute(
        [{ json: { id: 1 } }, { json: { id: 2 } }, { json: { id: 3 } }],
        {
            persons: (index) => index + 1,
            options: (index) => ({ explodeSlots: index !== 1, includeInputFields: index > 0 }),
        },
        {
            httpRequest: async ({ qs }) =>
                apiResponse([{ key: `${qs.persons}-first` }, { key: `${qs.persons}-second` }]),
        },
    );

    assert.deepEqual(output, [
        {
            json: { key: '1-first' },
            pairedItem: { item: 0 },
        },
        {
            json: { key: '1-second' },
            pairedItem: { item: 0 },
        },
        {
            json: {
                desk: 'AM',
                product: 'DOC',
                persons: 2,
                slots: [{ key: '2-first' }, { key: '2-second' }],
            },
            pairedItem: { item: 1 },
        },
        {
            json: { key: '3-first', desk: 'AM', product: 'DOC', persons: 3 },
            pairedItem: { item: 2 },
        },
        {
            json: { key: '3-second', desk: 'AM', product: 'DOC', persons: 3 },
            pairedItem: { item: 2 },
        },
    ]);
});

test('resolves all parameters per input item and maintains item links', async () => {
    const requests = [];
    const [output] = await execute(
        [{ json: { id: 1 } }, { json: { id: 2 } }],
        {
            desk: (index) => ['AM', 'UT'][index],
            product: (index) => ['DOC', 'BIO'][index],
            persons: (index) => index + 1,
            options: (index) => ({ includeInputFields: index === 1 }),
        },
        {
            httpRequest: async (options) => {
                requests.push(options);
                return apiResponse([{ key: options.qs.productKey }]);
            },
        },
    );

    assert.deepEqual(
        requests.map(({ url, qs }) => ({ url, qs })),
        [
            {
                url: 'https://oap.ind.nl/oap/api/desks/AM/slots',
                qs: { productKey: 'DOC', persons: 1 },
            },
            {
                url: 'https://oap.ind.nl/oap/api/desks/UT/slots',
                qs: { productKey: 'BIO', persons: 2 },
            },
        ],
    );
    assert.deepEqual(output, [
        {
            json: { slots: [{ key: 'DOC' }] },
            pairedItem: { item: 0 },
        },
        {
            json: { desk: 'UT', product: 'BIO', persons: 2, slots: [{ key: 'BIO' }] },
            pairedItem: { item: 1 },
        },
    ]);
});

test('returns trimmed codes and encodes the desk only in the request path', async () => {
    const [output] = await execute(
        [{ json: {} }],
        { desk: ' AM/other? ', product: ' DOC ', options: { includeInputFields: true } },
        {
            httpRequest: async (options) => {
                assert.equal(options.url, 'https://oap.ind.nl/oap/api/desks/AM%2Fother%3F/slots');
                assert.deepEqual(options.qs, { productKey: 'DOC', persons: 1 });
                return apiResponse();
            },
        },
    );
    assert.deepEqual(output, [
        {
            json: { desk: 'AM/other?', product: 'DOC', persons: 1, slots: [] },
            pairedItem: { item: 0 },
        },
    ]);
});

test('returns an empty slots array when no appointments are available', async (t) => {
    for (const includeInputFields of [false, true]) {
        await t.test(String(includeInputFields), async () => {
            assert.deepEqual(
                await execute([{ json: { id: 1 } }], { options: { includeInputFields } }),
                [
                    [
                        {
                            json: {
                                ...(includeInputFields
                                    ? { desk: 'AM', product: 'DOC', persons: 1 }
                                    : {}),
                                slots: [],
                            },
                            pairedItem: { item: 0 },
                        },
                    ],
                ],
            );
        });
    }
});

test('returns an empty output for empty input', async () => {
    assert.deepEqual(
        await execute([], {}, { httpRequest: async () => assert.fail('Unexpected API call') }),
        [[]],
    );
});

test('parses responses with CRLF XSSI prefixes and without a prefix', async (t) => {
    for (const prefix of [")]}'\r\n", ")]}',\r\n", '']) {
        await t.test(JSON.stringify(prefix), async () => {
            const [output] = await execute(
                [{ json: {} }],
                {},
                { httpRequest: async () => apiResponse([{ key: 'slot' }], 'OK', prefix) },
            );
            assert.deepEqual(output[0].json.slots, [{ key: 'slot' }]);
        });
    }
});

test('rejects invalid inputs before making an API call', async (t) => {
    const cases = [
        [{ desk: '' }, /Desk must be a non-empty string/],
        [{ desk: ' ' }, /Desk must be a non-empty string/],
        [{ desk: 123 }, /Desk must be a non-empty string/],
        [{ product: '' }, /Product must be a non-empty string/],
        [{ product: ' ' }, /Product must be a non-empty string/],
        [{ product: null }, /Product must be a non-empty string/],
        ...[0, -1, 1.5, '6', NaN, Infinity].map((persons) => [
            { persons },
            /Persons must be a positive integer/,
        ]),
    ];
    for (const [parameters, message] of cases) {
        await t.test(JSON.stringify(parameters), async () => {
            await assert.rejects(
                execute([{ json: {} }], parameters, {
                    httpRequest: async () => assert.fail('Unexpected API call'),
                }),
                (error) => {
                    assert.match(error.message, message);
                    assert.equal(error.context.itemIndex, 0);
                    return true;
                },
            );
        });
    }
});

test('rejects non-OK status, malformed JSON, and invalid response shapes', async (t) => {
    const cases = [
        [apiResponse([], 'ERROR'), /IND returned status "ERROR" instead of "OK"/],
        [apiResponse([], 'ok'), /IND returned status "ok" instead of "OK"/],
        [JSON.stringify({ data: [] }), /IND returned status "undefined" instead of "OK"/],
        [")]}',\nnot JSON", /IND returned an invalid JSON response/],
        ['null', /IND returned an invalid response/],
        ['[]', /IND returned an invalid response/],
        ['"unexpected"', /IND returned an invalid response/],
        [JSON.stringify({ status: 'OK' }), /IND response data must be a slots array/],
        [apiResponse({}), /IND response data must be a slots array/],
    ];
    for (const [body, message] of cases) {
        await t.test(body, async () => {
            await assert.rejects(
                execute([{ json: {} }], {}, { httpRequest: async () => body }),
                (error) => {
                    assert.match(error.message, message);
                    assert.equal(error.context.itemIndex, 0);
                    return true;
                },
            );
        });
    }
});

test('reports HTTP errors with the failing item index', async () => {
    await assert.rejects(
        execute(
            [{ json: {} }, { json: {} }],
            { persons: (index) => index + 1 },
            {
                httpRequest: async (options) => {
                    if (options.qs.persons === 2) throw new Error('HTTP 400 Bad Request');
                    return apiResponse();
                },
            },
        ),
        (error) => {
            assert.match(error.message, /HTTP 400 Bad Request/);
            assert.equal(error.context.itemIndex, 1);
            return true;
        },
    );
});

test('continues on failure and preserves failed input regardless of the flags', async (t) => {
    for (const options of [
        {},
        { includeInputFields: false },
        { includeInputFields: true },
        { explodeSlots: true, includeInputFields: false },
        { explodeSlots: true, includeInputFields: true },
    ]) {
        await t.test(JSON.stringify(options), async () => {
            const binary = { attachment: { data: 'aGVsbG8=', mimeType: 'text/plain' } };
            const [output] = await execute(
                [{ json: { id: 1 }, binary }, { json: { id: 2 } }],
                { persons: (index) => index + 1, options },
                {
                    continueOnFail: true,
                    httpRequest: async (options) =>
                        apiResponse([{ key: 'slot' }], options.qs.persons === 1 ? 'ERROR' : 'OK'),
                },
            );

            assert.equal(output.length, 2);
            assert.match(output[0].json.error, /IND returned status "ERROR"/);
            assert.equal(output[0].json.id, 1);
            assert.equal(output[0].binary, binary);
            assert.deepEqual(output[0].pairedItem, { item: 0 });
            assert.deepEqual(output[1].json, {
                ...(options.includeInputFields ? { desk: 'AM', product: 'DOC', persons: 2 } : {}),
                ...(options.explodeSlots ? { key: 'slot' } : { slots: [{ key: 'slot' }] }),
            });
            assert.deepEqual(output[1].pairedItem, { item: 1 });
        });
    }
});
