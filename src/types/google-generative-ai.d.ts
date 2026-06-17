declare module "@google/generative-ai" {
  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(options: {
      model: string;
      systemInstruction?: string;
      generationConfig?: { temperature?: number };
    }): {
      generateContent(
        prompt: string,
      ): Promise<{ response: { text(): string | undefined } }>;
    };
  }
}
