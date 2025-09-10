const fetch = require('node-fetch');

exports.handler = async function(event) {
  const { text } = JSON.parse(event.body);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key missing' })
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an expert English teacher. Correct the grammar, punctuation, and tenses. Do not repeat words. Keep the text clear and natural."
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0
      })
    });

    const data = await response.json();
    const corrected = data.choices?.[0]?.message?.content || text;

    return {
      statusCode: 200,
      body: JSON.stringify({ corrected_text: corrected })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
