import { Modding } from "@flamework/core";
import { Range, type RangeJSON } from "@rbxts/range";
import { endsWith, startsWith } from "@rbxts/string-utils";
import TestRunner from "./test-runner";

type ClassType<T = object, Args extends unknown[] = never[]> = {
  new(...args: Args): T;
};

type CallsiteMetadata = Modding.CallerMany<"line" | "character" | "text">;

interface IsTypeMetadata<T> {
  readonly text: Modding.Generic<T, "text">;
  readonly callsiteMeta: CallsiteMetadata;
}

function isExpectedException(e: unknown, expectedException: string | ClassType | undefined) {
  const eString = tostring(e);
  if (expectedException === undefined)
    return true;

  if (!typeIs(expectedException, "string")) {
    return e instanceof expectedException;
  }

  return startsWith(eString, expectedException)
    || endsWith(eString, expectedException)
    || eString.find(expectedException, undefined, true) !== undefined;
}

class AssertionFailedException {
  public constructor(
    public readonly message: string,
    public readonly meta?: CallsiteMetadata
  ) {
    error(this.toString(), 0);
  }

  public static equality(expected: unknown, actual: unknown, meta?: CallsiteMetadata): AssertionFailedException {
    return new AssertionFailedException(`Expected: ${expected}\nActual: ${actual}`, meta);
  }

  public static multipleFailures(methodName: string, totalItems: number, errors: [number, string, string][], meta?: CallsiteMetadata): AssertionFailedException {
    const message = `Assert.${methodName}() failure: ${errors.size()} of ${totalItems} items in the collection did not pass\n` +
      errors
        .map(([index, element, err]) => {
          const spaces = " ".rep(tostring(index).size());
          const indented = err.split("\n").map(line => spaces + line).join("\n");
          return `${index}     ${element}\n` + `${spaces}     ${indented}`;
        })
        .join("\n");

    return new AssertionFailedException(message, meta);
  }

  public toString(): string {
    const message: string[] = [];
    const { meta } = this;
    if (meta) {
      message.push(`[${meta.line}:${meta.character}] Test failed!`);
      message.push(meta.text);
      message.push(" ".rep(meta.character) + "^");
    }

    message.push(this.message);
    return message.join("\n");
  }
}

class Assert {
  /** @metadata macro */
  public static propertyEqual<T extends {}, K extends Exclude<keyof T, Symbol>, V extends T[K]>(object: T, property: K, expectedValue: V, meta?: CallsiteMetadata): asserts object is T & { [P in K]: V } {
    const value = object[property];
    if (value === expectedValue) return;
    throw new AssertionFailedException(`Expected object property "${tostring(property)}" to be ${expectedValue}, got ${value}`, meta);
  }

  /** @metadata macro */
  public static hasProperty<T extends {}, K extends string>(object: T, property: K, meta?: CallsiteMetadata): asserts object is T & { [P in K]: defined };
  public static hasProperty<T extends {}, K extends Exclude<keyof T, Symbol>>(object: T, property: K, meta?: CallsiteMetadata): asserts object is T & { [P in K]: NonNullable<T[K]> } {
    if (property in object) return;
    throw new AssertionFailedException(`Expected object to have property "${property}"`, meta);
  }

  /** @metadata macro */
  public static async doesNotThrowAsync(method: () => Promise<void>, meta?: CallsiteMetadata): Promise<void> {
    try {
      return await method();
    } catch (e) {
      throw new AssertionFailedException(`Expected async method not to throw, threw:\n${e}`, meta);
    }
  }

  /** @metadata macro */
  public static async throwsAsync(method: () => Promise<void>, expectedException?: string | ClassType, meta?: CallsiteMetadata): Promise<void> {
    let correctExceptionThrown = false;
    let thrown: unknown = undefined;

    await method()
      .catch((e: unknown) => {
        thrown = e;
        correctExceptionThrown = isExpectedException(e, expectedException);
      });

    if (correctExceptionThrown) return;
    throw new AssertionFailedException(
      `Expected async method to throw${expectedException !== undefined ? `\nExpected: ${tostring(expectedException)}\nActual: ${thrown}` : ""}`,
      meta
    );
  }

  /** @metadata macro */
  public static doesNotThrow<R>(method: () => R, meta?: CallsiteMetadata): R {
    try {
      return method();
    } catch (e) {
      throw new AssertionFailedException(`Expected method not to throw, threw:\n${e}`, meta);
    }
  }

  /** @metadata macro */
  public static throws(method: () => void, expectedException?: string | ClassType, meta?: CallsiteMetadata): void {
    let thrown: unknown;

    try {
      method();
    } catch (e) {
      thrown = e;
      if (expectedException !== undefined) {
        if (isExpectedException(e, expectedException)) return;
      } else
        return;
    }

    throw new AssertionFailedException(
      `Expected method to throw${expectedException !== undefined ? ' "' + tostring(expectedException) + `", threw "${thrown}"` : ""}`,
      meta
    );
  }

  /** @metadata macro */
  public static all<T extends defined>(array: T[], predicate: (element: T, index: number) => void, meta?: CallsiteMetadata): void {
    const errors: [number, string, string][] = [];
    let errorCount = 0;
    let index = 0;

    for (const element of array) {
      try {
        predicate(element, index);
      } catch (e) {
        errorCount = errors.push([index, tostring(element), tostring(e)]);
      }
      index++;
    }

    if (errorCount > 0)
      throw AssertionFailedException.multipleFailures("all", index, errors, meta);
  }

  /** @metadata macro */
  public static any<T extends defined>(array: T[], predicate: (element: T, index: number) => void, meta?: CallsiteMetadata): void {
    const errors: [number, string, string][] = [];
    let errorCount = 0;
    let index = 0;

    for (const element of array) {
      try {
        predicate(element, index);
      } catch (e) {
        errorCount = errors.push([index, tostring(element), tostring(e)]);
      }
      index++;
    }

    if (errorCount === index)
      throw AssertionFailedException.multipleFailures("any", index, errors, meta);
  }

  /** @metadata macro */
  public static doesNotContain<T extends defined>(element: T, array: T[], meta?: CallsiteMetadata): void {
    if (!array.includes(element)) return;
    throw new AssertionFailedException(`Expected array to not contain element "${array}"`, meta);
  }

  /** @metadata macro */
  public static contains<T extends defined>(expectedElement: T, array: T[], meta?: CallsiteMetadata): void;
  /** @metadata macro */
  public static contains<T extends defined>(array: T[], predicate: (element: T) => boolean, meta?: CallsiteMetadata): void;
  /** @metadata macro */
  public static contains<T extends defined>(array: T[] | T, predicate: T[] | ((element: T) => boolean), meta?: CallsiteMetadata): void {
    if (typeOf(predicate) === "function") {
      if ((<T[]>array).some(<(element: T) => boolean>predicate)) return;
      throw new AssertionFailedException("Expected array to contain elements matching the predicate", meta);
    } else {
      if ((<T[]>predicate).includes(<T>array)) return;
      throw new AssertionFailedException(`Expected array to contain element "${array}"`, meta);
    }
  }

  /** @metadata macro */
  public static empty(array: defined[], meta?: CallsiteMetadata): void {
    const size = array.size();
    if (size === 0) return;
    throw new AssertionFailedException(`Expected array to be empty\nActual length: ${size}`, meta);
  }

  /** @metadata macro */
  public static notEmpty(array: defined[], meta?: CallsiteMetadata): void {
    for (const _ of array) return;
    throw new AssertionFailedException("Expected array to not be empty", meta);
  }

  /** @metadata macro */
  public static single(array: defined[], meta?: CallsiteMetadata): void {
    const size = array.size();
    if (size === 1) return;
    throw new AssertionFailedException(`Expected array to have one element\nActual length: ${size}`, meta);
  }

  /** @metadata macro */
  public static count(expectedLength: number, collection: Map<unknown, unknown>, meta?: CallsiteMetadata): void;
  /** @metadata macro */
  public static count(expectedLength: number, collection: Set<unknown>, meta?: CallsiteMetadata): void;
  /** @metadata macro */
  public static count(expectedLength: number, collection: unknown[], meta?: CallsiteMetadata): void;
  /** @metadata macro */
  public static count(expectedLength: number, collection: unknown[] | Set<unknown> | Map<unknown, unknown>, meta?: CallsiteMetadata): void {
    const actualLength = (collection as Set<unknown>).size();
    if (expectedLength === actualLength) return;
    throw new AssertionFailedException(`Expected collection ${collection} to be of length ${expectedLength}\nActual length: ${actualLength}`, meta);
  }

  /** @metadata macro */
  public static startsWith(str: string, substring: string, meta?: CallsiteMetadata): void {
    if (startsWith(str, substring)) return;
    throw new AssertionFailedException(`Expected string "${str}" to start with substring "${substring}"`, meta);
  }

  /** @metadata macro */
  public static endsWith(str: string, substring: string, meta?: CallsiteMetadata): void {
    if (endsWith(str, substring)) return;
    throw new AssertionFailedException(`Expected string "${str}" to end with substring "${substring}"`, meta);
  }

  public static inRange(number: number, range: RangeJSON): void;
  public static inRange(number: number, range: Range): void;
  public static inRange(number: number, minimum: number, maximum: number): void;
  public static inRange(number: number, minimum: number | Range | RangeJSON, maximum?: number): void {
    if (typeIs(minimum, "number")) {
      if (number >= minimum && number <= maximum!) return;
      throw AssertionFailedException.equality(`${minimum}-${maximum}`, number);
    } else {
      const range = minimum instanceof Range ? minimum : Range.fromJSON(minimum);
      if (!range.isNumberWithin(number)) return;
      throw AssertionFailedException.equality(range.toString(), number);
    }
  }

  /** @metadata macro */
  public static isType<Expected>(
    value: unknown,
    guard?: ((value: unknown) => value is Expected) | Modding.Generic<Expected, "guard">,
    meta?: IsTypeMetadata<Expected>
  ): asserts value is Expected {
    const matches = guard?.(value) ?? false;
    if (matches) return;

    throw new AssertionFailedException(`Type ${meta?.text ?? "???"} did not pass the provided type guard ${guard}`, meta?.callsiteMeta);
  }

  /** @metadata macro */
  public static isCheckableType<T>(value: unknown, expectedType: ClassType<T>, meta?: CallsiteMetadata): asserts value is T;
  public static isCheckableType<K extends keyof CheckableTypes>(value: unknown, expectedType: K | ClassType, meta?: CallsiteMetadata): asserts value is CheckableTypes[K];
  public static isCheckableType<K extends keyof CheckableTypes>(value: unknown, expectedType: K | ClassType, meta?: CallsiteMetadata): void {
    if (typeOf(expectedType) === "string") {
      const actualType = typeOf(value);
      if (actualType === expectedType) return;
      throw new AssertionFailedException(`Expected type: ${expectedType}\nActual type: ${actualType}`, meta);
    }

    if (value instanceof <ClassType>expectedType) return;
    throw new AssertionFailedException(`Expected class type: ${expectedType}\nActual class type: ${typeOf(value) === "table" ? value : typeOf(value)}`, meta);
  }

  /** @metadata macro */
  public static true(value: unknown, meta?: CallsiteMetadata): asserts value is true {
    this.equal(true, value, meta);
  }

  /** @metadata macro */
  public static false(value: unknown, meta?: CallsiteMetadata): asserts value is false {
    this.equal(false, value, meta);
  }

  /** @metadata macro */
  public static undefined(value: unknown, meta?: CallsiteMetadata): asserts value is undefined {
    if (value === undefined) return;
    this.equal(undefined, value, meta);
  }

  /** @metadata macro */
  public static defined(value: unknown, meta?: CallsiteMetadata): asserts value is defined {
    if (value !== undefined) return;
    throw new AssertionFailedException("Expected value to not be undefined", meta);
  }

  /** @metadata macro */
  public static fuzzyEqual(expected: number, actual: number, epsilon = 1e-6, meta?: CallsiteMetadata): void {
    const difference = math.abs(expected - actual);
    const offBy = difference - epsilon;
    const near = offBy <= 0;
    if (near) return;

    throw new AssertionFailedException(`Expected values to be nearly equal\nExpected: ${expected}\nActual: ${actual}\nOff by: ${offBy}`, meta);
  }

  /** @metadata macro */
  public static notEqual(expected: unknown, actual: unknown, meta?: CallsiteMetadata): void {
    if (expected !== actual) return;
    throw new AssertionFailedException("Expected values to be inequal, got: " + actual, meta);
  }

  /** @metadata macro */
  public static equal(expected: unknown, actual: unknown, meta?: CallsiteMetadata): void {
    if (expected === actual) return;
    throw AssertionFailedException.equality(expected, actual, meta);
  }

  /** @metadata macro */
  public static custom(
    runner: (fail: ((message: string) => void) | ((expected: unknown, actual: unknown) => void)) => void,
    meta?: CallsiteMetadata
  ): void {
    runner((message, actual) => {
      throw AssertionFailedException.equality(message, actual, meta);
    });
  }

  public static appendFailedMessage(message: string, runner: () => void): void {
    try {
      runner();
    } catch (e) {
      if (e instanceof AssertionFailedException)
        (e as Writable<AssertionFailedException>).message = `${message}\n${e.message}`;

      throw e;
    }
  }
}

export = Assert;