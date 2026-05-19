# mimOE Local Grammar Agent

Small command-line grammar correction agent that runs against a local mimOE Studio inference endpoint.

The goal is to keep the project simple: type a sentence, send it to the local OpenAI-compatible API exposed by mimOE Studio, and print the corrected version.

## What It Does

- Accepts text from the terminal.
- Sends the text to a local mimOE chat completions endpoint.
- Uses a narrow system prompt for grammar, spelling, and punctuation correction.
- Prints only the corrected text returned by the local model.

Example:

```txt
Text: i has a meeting tomorrow and i need send the report
Corrected: I have a meeting tomorrow, and I need to send the report.
```

## Requirements

- Node.js 18 or newer.
- mimOE Studio installed and running.
- A local model loaded in mimOE Studio Model View.
- The local API endpoint from the API button in Model View.

This was tested with the bundled `smollm-360m` model.

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Update `.env` if your mimOE Studio endpoint, API key, or model name is different:

```env
MIMOE_BASE_URL=http://localhost:8083/mimik-ai/openai/v1
MIMOE_API_KEY=1234
MIMOE_MODEL=smollm-360m
```

Run the agent:

```bash
npm run dev
```

## Approach

The agent is intentionally small. It does one job: take a piece of English text and ask the local model to correct grammar, spelling, and punctuation while preserving the original meaning.

Each user input is sent as a single `chat/completions` request. The response is read from `choices[0].message.content` and printed back to the terminal.

## Framework and Tooling Choices

This project uses a minimal BYO Framework approach:

- Node.js for the command-line runtime.
- Native `fetch` for direct HTTP requests.
- `dotenv` for local configuration.
- mimOE Studio as the local model host.
- `smollm-360m` as the local test model.

I used direct API calls instead of LangChain, LlamaIndex, or CrewAI because the mimOE endpoint is already OpenAI-compatible. A small direct request keeps the data flow easy to inspect, test, and explain.

## How The Pieces Connect

```txt
Terminal input
  -> Node.js grammar agent
  -> mimOE Studio local OpenAI-compatible API
  -> loaded local model
  -> corrected text response
```

mimOE Studio runs the model locally and exposes the inference API. The Node.js agent reads the base URL, API key, and model name from `.env`, then sends the user's text to `/chat/completions`.

## Notes

Small local models can be inconsistent with formatting instructions, especially on longer or non-English text. For best results, use short English inputs or load a stronger local model in mimOE Studio.
