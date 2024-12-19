import { Modding, Reflect } from "@flamework/core";
import { Maybe, Errors, Meta } from "./common";

export const Fact = Modding.createDecorator<void[]>("Method", descriptor => {
  if (Reflect.hasMetadata(descriptor.object, Meta.Theory))
    throw Errors.NotBoth;

  Reflect.defineMetadata(descriptor.object, Meta.Fact, true, descriptor.property)
});

export const Theory = Modding.createDecorator<void[]>("Method", descriptor => {
  if (Reflect.hasMetadata(descriptor.object, Meta.Fact))
    throw Errors.NotBoth;

  Reflect.defineMetadata(descriptor.object, Meta.Theory, true, descriptor.property)
});

export const InlineData = Modding.createDecorator<unknown[]>("Method", (descriptor, args) => {
  if (Reflect.hasMetadata(descriptor.object, Meta.Fact))
    throw Errors.InvalidInlineData;

  const inlineDataMeta = <Maybe<unknown[][]>>Reflect.getMetadata(descriptor.object, Meta.InlineData, descriptor.property) ?? [];
  inlineDataMeta.push(args);

  Reflect.defineMetadata(descriptor.object, Meta.InlineData, inlineDataMeta, descriptor.property);
});