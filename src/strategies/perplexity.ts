import { LLMStrategy } from './index';

export class PerplexityStrategy implements LLMStrategy {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'sonar',
  ) {}

  async sendRequest(prompt: string): Promise<string> {
    const response = await fetch('https://api.perplexity.ai/v1/sonar', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Perplexity API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      choices: [{ message: { content: string } }];
    };
    return data.choices[0].message.content;
  }
}
