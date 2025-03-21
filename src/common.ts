export const enum Errors {
  NotBoth = "[Runit]: A method cannot be marked as both a Fact and a Theory",
  UnexpectedData = "[Runit]: InlineData can only be used on Theories"
}

export const enum Meta {
  Fact = "runit:fact",
  Theory = "runit:theory",
  TestData = "runit:test_data",
  LoadOrder = "runit:load_order",
}