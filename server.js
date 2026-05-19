const dotenv = require("dotenv");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

dotenv.config({ quiet: true });

const MIMOE_BASE_URL =
  (process.env.MIMOE_BASE_URL || "http://localhost:8083/mimik-ai/openai/v1")
    .trim()
    .replace(/\/+$/, "");

const MIMOE_API_KEY = (process.env.MIMOE_API_KEY || "1234").trim();
const MIMOE_MODEL = (process.env.MIMOE_MODEL || "smollm-360m").trim();
const REQUEST_TIMEOUT_MS = 15000;

function validateConfig() {
  const missing = [];

  if (!MIMOE_BASE_URL) missing.push("MIMOE_BASE_URL");
  if (!MIMOE_API_KEY) missing.push("MIMOE_API_KEY");
  if (!MIMOE_MODEL) missing.push("MIMOE_MODEL");

  if (missing.length > 0) {
    throw new Error(`Missing required environment value(s): ${missing.join(", ")}`);
  }

  try {
    const url = new URL(MIMOE_BASE_URL);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Endpoint must start with http:// or https://");
    }
  } catch (error) {
    throw new Error(`Invalid MIMOE_BASE_URL: ${error.message}`);
  }
}

function formatErrorBody(body) {
  if (!body) return "No error body returned.";

  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message || parsed.message || JSON.stringify(parsed);
  } catch {
    return body;
  }
}

async function requestMimOE(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${MIMOE_BASE_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MIMOE_API_KEY}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `mimOE API returned HTTP ${response.status}: ${formatErrorBody(responseText)}`
      );
    }

    try {
      return responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error("mimOE API returned a non-JSON response.");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `mimOE request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check that the model is loaded and responding.`
      );
    }

    if (
      error.message.includes("fetch failed") ||
      error.code === "ECONNREFUSED" ||
      error.cause?.code === "ECONNREFUSED"
    ) {
      throw new Error(
        `Could not connect to mimOE at ${MIMOE_BASE_URL}. Make sure mimOE Studio is running and the local API endpoint is enabled.`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkConnection() {
  const data = await requestMimOE("/models");
  const models = Array.isArray(data.data)
    ? data.data.map((model) => model.id || model.name).filter(Boolean)
    : [];

  if (models.length === 0) {
    throw new Error("Connected to mimOE, but no models were returned by /models.");
  }

  if (!models.includes(MIMOE_MODEL)) {
    throw new Error(
      `Model "${MIMOE_MODEL}" was not found. Available model(s): ${models.join(", ")}`
    );
  }

  return models;
}

function cleanModelOutput(output) {
  const text = output.trim().replace(/```/g, "");
  const quotedMatches = [...text.matchAll(/"([^"]+)"/g)];

  if (quotedMatches.length > 0) {
    return normalizeText(quotedMatches[quotedMatches.length - 1][1]);
  }

  return normalizeText(
    text
      .replace(/^the corrected sentence is:\s*/i, "")
      .replace(/^the correct english sentence is:\s*/i, "")
      .replace(/^the correct english translation is:\s*/i, "")
      .replace(/^correct english:\s*/i, "")
      .split(/\r?\n/)[0]
  );
}

function normalizeText(text) {
  return text.trim().replace(/\bi\b/g, "I");
}

async function correctText(text) {
  const data = await requestMimOE("/chat/completions", {
    method: "POST",
    body: {
      model: MIMOE_MODEL,
      messages: [
        {
          role: "user",
          content: `Rewrite this in correct English. Return only the rewritten sentence: ${text}`,
        },
      ],
      temperature: 0,
      max_tokens: 120,
      stream: false,
    },
  });

  const output = data.choices?.[0]?.message?.content;

  if (!output) {
    throw new Error("mimOE returned an empty or unexpected chat response.");
  }

  return cleanModelOutput(output);
}

async function main() {
  try {
    validateConfig();
  } catch (error) {
    console.error("Configuration error:");
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.log("mimOE Grammar Correction Agent");
  console.log("Configured model:", MIMOE_MODEL);
  console.log("Endpoint:", MIMOE_BASE_URL);
  console.log("Checking mimOE connection...");

  try {
    const models = await checkConnection();
    console.log(`Connection OK. Available model(s): ${models.join(", ")}`);
  } catch (error) {
    console.error("\nStartup check failed:");
    console.error(error.message);
    console.error(
      "\nMake sure mimOE Studio is running, the selected model is loaded, and your .env values match the API button in Model View."
    );
    process.exitCode = 1;
    return;
  }

  console.log("Paste English text to correct.");
  console.log("Type 'exit' to quit.\n");

  const rl = readline.createInterface({ input, output });

  while (true) {
    let userInput;

    try {
      userInput = await rl.question("Text: ");
    } catch (error) {
      if (error.code === "ERR_USE_AFTER_CLOSE") {
        break;
      }

      throw error;
    }

    if (["exit", "quit"].includes(userInput.trim().toLowerCase())) {
      console.log("Goodbye.");
      rl.close();
      break;
    }

    if (!userInput.trim()) {
      continue;
    }

    try {
      const answer = await correctText(userInput);

      console.log(`\nCorrected: ${answer}\n`);
    } catch (error) {
      console.error("\nRequest failed:");
      console.error(error.message);
      console.error(
        "\nCheck mimOE Studio, the loaded model, and the values in your .env file.\n"
      );
    }
  }
}

main();
