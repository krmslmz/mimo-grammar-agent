const dotenv = require("dotenv");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

dotenv.config({ quiet: true });

const MIMOE_BASE_URL =
  process.env.MIMOE_BASE_URL || "http://localhost:8083/mimik-ai/openai/v1";

const MIMOE_API_KEY = process.env.MIMOE_API_KEY || "1234";
const MIMOE_MODEL = process.env.MIMOE_MODEL || "smollm-360m";

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
  const response = await fetch(`${MIMOE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MIMOE_API_KEY}`,
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`mimOE API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  const output = data.choices?.[0]?.message?.content;

  return output ? cleanModelOutput(output) : "No response received.";
}

async function main() {
  console.log("mimOE Grammar Correction Agent");
  console.log("Connected model:", MIMOE_MODEL);
  console.log("Endpoint:", MIMOE_BASE_URL);
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
      console.error("\nError calling mimOE local endpoint:");
      console.error(error.message);
      console.error(
        "\nMake sure mimOE Studio is running, the selected model is loaded, and your .env values are correct.\n"
      );
    }
  }
}

main();
