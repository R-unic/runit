import { Modding, Reflect } from "@flamework/core";
import { Maybe, Errors, Meta } from "./common";

export const Fact = Modding.createDecorator<void[]>("Method", descriptor => {
  if (Reflect.hasMetadata(descriptor.object, Meta.TestData))
    throw Errors.UnexpectedData;
  if (Reflect.hasMetadata(descriptor.object, Meta.Theory))
    throw Errors.NotBoth;

  Reflect.defineMetadata(descriptor.object, Meta.Fact, true, descriptor.property);
});

export const Theory = Modding.createDecorator<void[]>("Method", descriptor => {
  if (Reflect.hasMetadata(descriptor.object, Meta.Fact))
    throw Errors.NotBoth;

  Reflect.defineMetadata(descriptor.object, Meta.Theory, true, descriptor.property);
});

export function InlineData<T extends object, Args extends unknown[]>(...args: Args) {
  return (ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: Args) => void>) => {
    if (Reflect.hasMetadata(ctor, Meta.Fact))
      throw Errors.UnexpectedData;

    const dataMeta = <Maybe<unknown[][]>>Reflect.getMetadata(ctor, Meta.TestData, propertyKey) ?? [];
    dataMeta.push(args);

    Reflect.defineMetadata(ctor, Meta.TestData, dataMeta, propertyKey);
  }
}