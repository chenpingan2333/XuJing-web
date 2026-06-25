export class CharacterError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = "CharacterError";
  }
}
