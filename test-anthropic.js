require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

async function testAnthropic() {
  console.log('API Key exists?', !!process.env.ANTHROPIC_API_KEY);
  console.log('API Key length:', (process.env.ANTHROPIC_API_KEY || '').length);
  
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('No API key found in .env');
    return;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    console.log('Calling Claude...');
    const apiResponse = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Say hello!' }]
    });
    console.log('Success! Response:', apiResponse.content[0].text);
  } catch (err) {
    console.error('Error calling Anthropic API:', err);
  }
}

testAnthropic();
