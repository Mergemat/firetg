export class InteractiveRequiredError extends Error {
  constructor(prompt: string) {
    super(`Interactive input required for prompt: ${prompt.trim()}`);
    this.name = "InteractiveRequiredError";
  }
}
