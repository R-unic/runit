export const enum Errors {
  NotBoth = "[Runit]: A method cannot be marked as both a Fact and a Theory",
  UnexpectedData = "[Runit]: InlineData/ComputedData can only be used on Theories"
}

export const enum Meta {
  Fact = "runit:fact",
  Theory = "runit:theory",
  Data = "runit:data",
  MemberData = "runit:member_data",
  LoadOrder = "runit:load_order",
}