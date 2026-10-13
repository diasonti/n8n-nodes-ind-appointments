# n8n-nodes-ind-appointments

An n8n node for fetching available appointment slots from the Dutch Immigration and Naturalisation Service (IND). No credentials required.

This is an unofficial integration, not affiliated with IND. Availability and response formats depend on IND's appointment service. Use reasonable polling intervals.

## Installation

After this package is published to npm, install it in self-hosted n8n running on Node.js 24+ with community nodes enabled:

1. Open **Settings → Community nodes → Install**.
2. Enter `n8n-nodes-ind-appointments` as the package name.
3. Acknowledge the risks of installing a community node and select **Install**.

For details, see the [n8n community-node installation documentation](https://docs.n8n.io/integrations/community-nodes/installation/gui-install/).

## Development quick start

Requires Node.js 24+ and npm. From the project directory:

```bash
npm install
npm run dev
```

Open the URL printed by the CLI (usually `http://localhost:5678`). The first launch downloads n8n and may take 2–5 minutes.

## Usage

Create a workflow with **Manual Trigger → IND: Get Appointment Slots**, set the required inputs, and execute it:

| Input       | Type             | Example |
| ----------- | ---------------- | ------- |
| **Desk**    | Non-empty string | `AM`    |
| **Product** | Non-empty string | `DOC`   |
| **Persons** | Positive integer | `6`     |

Each input item returns `desk`, `product`, `persons`, and a `slots` array. No available appointments returns `slots: []`. Inputs and options support n8n expressions.

Under **Options** (both off by default):

- **Include Input Fields**: copy incoming JSON fields into the output; output fields take precedence.
- **Explode Slots**: return one item per slot with slot fields at the top level instead of a `slots` array. No slots produces no items.

Use **On Error → Continue** to return an `error` field instead of stopping the workflow.

Existing workflows must use node type `n8n-nodes-ind-appointments.indGetAppointmentSlots` after this rename.

## Development

| Command                | Purpose             |
| ---------------------- | ------------------- |
| `npm run build`        | Build the node      |
| `npm run lint`         | Check conventions   |
| `npm run format:check` | Check formatting    |
| `npm test`             | Build and run tests |

For preview options, see the [n8n node CLI documentation](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool/).

## License

MIT. See [LICENSE](LICENSE).
