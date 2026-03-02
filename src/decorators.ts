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
  if (Reflect.hasMetadata(ctor, Meta.Data))
    throw Errors.UnexpectedData;
  if (Reflect.hasMetadata(ctor, Meta.Theory))
    throw Errors.NotBoth;

  Reflect.defineMetadata(ctor, Meta.Fact, true, propertyKey);
};

/**
 * Marks a method as a `Theory`, which is a test that is run once per list of
 * arguments provided by each `InlineData` decorator.
 *
 * If the method is decorated with `Fact`, it will throw an error.
 *
 * If the method is not decorated with any `InlineData`, it will throw an error.
 */
export function Theory<T extends object, Args extends readonly unknown[]>(ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: Args) => void>): void {
  if (Reflect.hasMetadata(ctor, Meta.Fact))
    throw Errors.NotBoth;

  Reflect.defineMetadata(ctor, Meta.Theory, true, propertyKey);
};

/**
 * Provides test data for a `Theory` test.
 * The test data is provided as a set of arguments to the test method.
 * The test method will be run once for each set of arguments provided.
 */
export function InlineData<T extends object, Args extends readonly unknown[]>(...args: Args) {
  return (ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: Args) => void>) => {
    if (Reflect.hasMetadata(ctor, Meta.Fact, propertyKey))
      throw Errors.UnexpectedData;

    const dataMeta = Reflect.getMetadata<(readonly unknown[])[]>(ctor, Meta.Data, propertyKey) ?? [];
    dataMeta.push(args);

    Reflect.defineMetadata(ctor, Meta.Data, dataMeta, propertyKey);
  }
}

export type Producer<T extends object, Args extends readonly unknown[]> = (ctor: T) => Args;

/**
 * Provides computed test data for a `Theory` test.
 * The test data is provided as a function that computes a dataset for the test method.
 * The test method will be run once for each set of data generated from the function.
 */
export function MemberData<T extends object, K extends ExtractKeys<T, (this: T) => readonly unknown[]>>(key: K) {
  type Args = ReturnType<T[K]> extends readonly unknown[] ? ReturnType<T[K]> : readonly unknown[];
  return (ctor: T, propertyKey: string, _: TypedPropertyDescriptor<(this: T, ...args: Args) => void>) => {
    if (Reflect.hasMetadata(ctor, Meta.Fact, propertyKey))
      throw Errors.UnexpectedData;

    const dataMeta = Reflect.getMetadata<Producer<T, Args>[]>(ctor, Meta.MemberData, propertyKey) ?? [];
    dataMeta.push(ctor[key] as never);

    Reflect.defineMetadata(ctor, Meta.MemberData, dataMeta, propertyKey);
  }
}

export function Order(order: number) {
  return (ctor: defined) => Reflect.defineMetadata(ctor, Meta.LoadOrder, order);
}