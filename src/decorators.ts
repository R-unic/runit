import { Reflect } from "@flamework/core";
import { Errors, Meta } from "./common";

/**
 * Marks a method as a `Fact`, which is a test that should be run once.
 *
 * If the method is decorated with `InlineData`, it will throw an error.
 *
 * If the method is decorated with `Theory`, it will throw an error.
 */
export function Fact<T extends object>(ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: void[]) => void>): void {
  if (Reflect.hasMetadata(ctor, Meta.TestData))
    throw Errors.UnexpectedData;
  if (Reflect.hasMetadata(ctor, Meta.Theory))
    throw Errors.NotBoth;

  Reflect.defineMetadata(ctor, Meta.Fact, true, propertyKey);
};

/**
 * Marks a method as a `Theory`, which is a test that is run once with each set of
 * data provided by the `InlineData` decorator.
 *
 * If the method is decorated with `Fact`, it will throw an error.
 *
 * If the method is not decorated with `InlineData`, it will throw an error.
 */
export function Theory<T extends object, Args extends unknown[]>(ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: Args) => void>): void {
  if (Reflect.hasMetadata(ctor, Meta.Fact))
    throw Errors.NotBoth;

  Reflect.defineMetadata(ctor, Meta.Theory, true, propertyKey);
};

/**
 * Provides test data for a `Theory` test.
 * The test data is provided as a set of arguments to the test method.
 * The test method will be run once for each set of arguments provided.
 */
export function InlineData<T extends object, Args extends unknown[]>(...args: Args) {
  return (ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: Args) => void>) => {
    if (Reflect.hasMetadata(ctor, Meta.Fact))
      throw Errors.UnexpectedData;

    const dataMeta = Reflect.getMetadata<unknown[][]>(ctor, Meta.TestData, propertyKey) ?? [];
    dataMeta.push(args);

    Reflect.defineMetadata(ctor, Meta.TestData, dataMeta, propertyKey);
  }
}

export function Order(order: number) {
  return (ctor: defined) => Reflect.defineMetadata(ctor, Meta.LoadOrder, order);
}