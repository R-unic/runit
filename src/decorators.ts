import { Modding, Reflect } from "@flamework/core";
import { Errors, Meta } from "./common";

export function Fact<T extends object>(ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: void[]) => void>): void {
  if (Reflect.hasMetadata(ctor, Meta.TestData))
    throw Errors.UnexpectedData;
  if (Reflect.hasMetadata(ctor, Meta.Theory))
    throw Errors.NotBoth;

  Reflect.defineMetadata(ctor, Meta.Fact, true, propertyKey);
};

export function Theory<T extends object, Args extends unknown[]>(ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: Args) => void>): void {
  if (Reflect.hasMetadata(ctor, Meta.Fact))
    throw Errors.NotBoth;

  Reflect.defineMetadata(ctor, Meta.Theory, true, propertyKey);
};

export function InlineData<T extends object, Args extends unknown[]>(...args: Args) {
  return (ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: Args) => void>) => {
    if (Reflect.hasMetadata(ctor, Meta.Fact))
      throw Errors.UnexpectedData;

    const dataMeta = Reflect.getMetadata<unknown[][]>(ctor, Meta.TestData, propertyKey) ?? [];
    dataMeta.push(args);

    Reflect.defineMetadata(ctor, Meta.TestData, dataMeta, propertyKey);
  }
}

export const Order = Modding.createDecorator<[order: number]>("Class", (descriptor, [order]) =>
  Reflect.defineMetadata(descriptor.object, Meta.LoadOrder, order)
);