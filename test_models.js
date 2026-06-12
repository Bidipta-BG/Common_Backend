require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function listModels() {
  try {
    const models = await anthropic.models.list();
    console.log("\nAvailable models on your account:");
    models.data.forEach(m => console.log(`  - ${m.id}  (${m.display_name})`));
  } catch (error) {
    console.error("Error fetching models:", error.message);
  }
}

listModels();
