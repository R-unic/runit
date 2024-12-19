export type Maybe<T> = T | undefined;

export const enum Errors {
  NotBoth = "[Runit]: A method cannot be marked as both a Fact and a Theory",
  InvalidInlineData = "[Runit]: InlineData can only be used on Theories"
}

export const enum Meta {
  Fact = "runit:fact",
  Theory = "runit:theory",
  InlineData = "runit:inline_data",
}